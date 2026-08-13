"""Council orchestration: quick mode, deep mode, peer review and synthesis."""

from __future__ import annotations

import asyncio
import random
import string
from dataclasses import dataclass

from sqlalchemy import select

from . import db
from .agents.base import AgentResponse, Attachment
from .agents.registry import build_agent, provider_labels
from .config import Config, load_config

MAX_CONTEXT_MESSAGES = 20


# --------------------------------------------------------------------------
# event bus: council runs live past the SSE connection that started them
# --------------------------------------------------------------------------
class RunBus:
    def __init__(self) -> None:
        self.history: list[dict] = []
        self.subscribers: set[asyncio.Queue] = set()
        self.finished = False

    def publish(self, event: str, **data) -> None:
        payload = {"event": event, **data}
        self.history.append(payload)
        if event in ("council.completed", "council.failed"):
            self.finished = True
        for queue in self.subscribers:
            queue.put_nowait(payload)

    async def stream(self):
        queue: asyncio.Queue = asyncio.Queue()
        for payload in list(self.history):
            yield payload
        if self.finished:
            return
        self.subscribers.add(queue)
        try:
            while True:
                payload = await queue.get()
                yield payload
                if payload["event"] in ("council.completed", "council.failed"):
                    return
        finally:
            self.subscribers.discard(queue)


BUSES: dict[str, RunBus] = {}


def bus_for(run_id: str) -> RunBus:
    if len(BUSES) > 200:  # finished runs are replayable from the database
        for stale in [rid for rid, b in list(BUSES.items()) if b.finished][:100]:
            BUSES.pop(stale, None)
    return BUSES.setdefault(run_id, RunBus())


# --------------------------------------------------------------------------
# prompts
# --------------------------------------------------------------------------
# A room remembers, and that is the trap: once an answer here reported something
# impossible — a search that was refused, a tool that was missing — the sentence
# stays in the transcript and in the resumed session, and a model will follow its
# own past words over what it can actually do on this turn.
STALE_CLAIMS = (
    "Earlier turns are context, not constraints: a limit reported in one of them "
    "may no longer hold, so decide what you can do by trying it now, not by what "
    "was said then."
)

MEMBER_INSTRUCTIONS = (
    "You are answering a user's question directly, as a knowledgeable assistant. "
    "Answer the question itself; do not modify files or ask for confirmation. "
    "Write your answer in the same language the user asked in. "
    f"{STALE_CLAIMS}"
)

REVIEW_INSTRUCTIONS = """You are reviewing anonymous answers written by other assistants to the question below.
Evaluate: factual correctness, reasoning quality, missing considerations, unsupported claims,
useful unique insights, and disagreements between the answers.
Be specific and concise. Do not guess who wrote which answer."""

CHAIRMAN_INSTRUCTIONS = f"""You are the Chairman of a council of AI assistants.
Using the independent answers below, produce ONE coherent final answer for the user.

{STALE_CLAIMS}

Requirements:
- the answers below are your material: the final answer is built from them, and
  they outrank anything an earlier turn of this conversation says
- identify consensus
- identify disagreements and resolve them where the evidence allows
- preserve useful minority observations
- do not treat a majority as proof of a factual claim
- never simply concatenate the answers
- write the final answer in the same language the user asked in
- do not mention the council process, the members, or this instruction; just answer the user"""


def _context_block(history: list[tuple[str, str]]) -> str:
    if not history:
        return ""
    lines = ["Conversation so far:"]
    for role, content in history:
        speaker = "User" if role == "user" else "Assistant"
        lines.append(f"{speaker}: {content}")
    return "\n".join(lines) + "\n\n"


def member_prompt(question: str, history: list[tuple[str, str]]) -> str:
    return f"{MEMBER_INSTRUCTIONS}\n\n{_context_block(history)}Question:\n{question}"


def review_prompt(question: str, labelled: list[tuple[str, str]]) -> str:
    answers = "\n\n".join(f"--- Response {label} ---\n{content}" for label, content in labelled)
    return f"{REVIEW_INSTRUCTIONS}\n\nQuestion:\n{question}\n\n{answers}\n\nWrite your review."


def chairman_prompt(
    question: str,
    history: list[tuple[str, str]],
    labelled: list[tuple[str, str]],
    reviews: list[str],
) -> str:
    answers = "\n\n".join(f"--- Response {label} ---\n{content}" for label, content in labelled)
    parts = [CHAIRMAN_INSTRUCTIONS, "", _context_block(history) + f"User question:\n{question}", "", answers]
    if reviews:
        joined = "\n\n".join(f"--- Peer review {i + 1} ---\n{r}" for i, r in enumerate(reviews))
        parts += ["", "Peer reviews:", joined]
    parts += ["", "Write the final answer for the user."]
    return "\n".join(parts)


def anonymize(responses: list[AgentResponse]) -> list[tuple[str, str]]:
    """Map successful responses to shuffled Response A/B/C labels."""
    shuffled = list(responses)
    random.shuffle(shuffled)
    return [(string.ascii_uppercase[i], r.content) for i, r in enumerate(shuffled)]


# --------------------------------------------------------------------------
# engine
# --------------------------------------------------------------------------
@dataclass
class RunInput:
    run_id: str
    room_id: str
    question: str
    history: list[tuple[str, str]]
    attachments: list[Attachment]
    members: list[str]
    chairman: str
    mode: str


async def _record_agent_run(run_id: str, provider: str, role: str, resp: AgentResponse) -> None:
    async with db.session() as s:
        s.add(
            db.AgentRun(
                council_run_id=run_id,
                provider=provider,
                model=resp.model,
                role=role,
                status="completed" if resp.success else "failed",
                content=resp.content,
                attachment_supported=resp.attachment_supported,
                duration_ms=resp.duration_ms,
                exit_code=resp.exit_code,
                error=resp.error,
                started_at=db.utcnow(),
                completed_at=db.utcnow(),
            )
        )
        await s.commit()


async def _ask_member(spec: RunInput, provider: str, bus: RunBus, cfg: Config) -> AgentResponse:
    agent = build_agent(provider, cfg)
    bus.publish("agent.started", provider=provider)
    session = await _session_for(spec.room_id, provider) if cfg.council.resume_sessions else None
    try:
        # With a live session the member already holds the thread, so only the new
        # question is sent. Without one, CouncilRoom supplies the whole context.
        prompt = spec.question if session else member_prompt(spec.question, spec.history)
        resp = await agent.ask(prompt, spec.attachments, session)
        if session and not resp.success:
            # Sessions expire or get pruned; retry once as a fresh conversation.
            resp = await agent.ask(member_prompt(spec.question, spec.history), spec.attachments)
    except Exception as exc:  # adapter bug or missing executable
        resp = AgentResponse(provider, "", 0, False, error=f"{type(exc).__name__}: {exc}")
    if resp.session_id and cfg.council.resume_sessions:
        await _remember_session(spec.room_id, provider, resp.session_id)
    await _record_agent_run(spec.run_id, provider, "member", resp)
    if resp.success:
        bus.publish(
            "agent.completed", provider=provider, duration_ms=resp.duration_ms,
            attachment_supported=resp.attachment_supported,
        )
    else:
        bus.publish("agent.failed", provider=provider, error=resp.error, duration_ms=resp.duration_ms)
    return resp


async def _peer_reviews(spec: RunInput, ok: list[AgentResponse], bus: RunBus, cfg: Config) -> list[str]:
    bus.publish("peer_review.started")

    async def review(reviewer: AgentResponse) -> str | None:
        others = [r for r in ok if r.provider != reviewer.provider]
        if not others:
            return None
        agent = build_agent(reviewer.provider, cfg)
        try:
            resp = await agent.ask(review_prompt(spec.question, anonymize(others)), [])
        except Exception as exc:
            resp = AgentResponse(reviewer.provider, "", 0, False, error=f"{type(exc).__name__}: {exc}")
        async with db.session() as s:
            s.add(
                db.PeerReview(
                    council_run_id=spec.run_id,
                    reviewer_provider=reviewer.provider,
                    content=resp.content,
                    duration_ms=resp.duration_ms,
                    error=resp.error,
                )
            )
            await s.commit()
        return resp.content if resp.success else None

    results = await asyncio.gather(*[review(r) for r in ok], return_exceptions=True)
    reviews = [r for r in results if isinstance(r, str) and r.strip()]
    bus.publish("peer_review.completed", count=len(reviews))
    return reviews


async def execute(spec: RunInput, cfg: Config | None = None) -> None:
    """Run one council deliberation, persisting state and publishing events."""
    cfg = cfg or load_config()
    bus = bus_for(spec.run_id)
    bus.publish("council.started", mode=spec.mode, members=spec.members, chairman=spec.chairman)
    await _set_run(spec.run_id, status="running", started_at=db.utcnow())

    results = await asyncio.gather(
        *[_ask_member(spec, provider, bus, cfg) for provider in spec.members],
        return_exceptions=True,
    )
    ok = [r for r in results if isinstance(r, AgentResponse) and r.success]

    # The requirement can never exceed the council actually sitting for this run.
    minimum = max(1, min(cfg.council.minimum_successful_members, len(spec.members)))
    if len(ok) < minimum:
        error = f"only {len(ok)}/{len(spec.members)} members succeeded (minimum {minimum})"
        await _set_run(spec.run_id, status="failed", error=error, completed_at=db.utcnow())
        bus.publish("council.failed", error=error)
        return

    reviews = await _peer_reviews(spec, ok, bus, cfg) if spec.mode == "deep" else []

    bus.publish("synthesis.started", chairman=spec.chairman)
    chairman = build_agent(spec.chairman, cfg)
    prompt = chairman_prompt(spec.question, spec.history, anonymize(ok), reviews)
    try:
        answer = await chairman.ask(prompt, spec.attachments)
    except Exception as exc:
        answer = AgentResponse(spec.chairman, "", 0, False, error=f"{type(exc).__name__}: {exc}")
    await _record_agent_run(spec.run_id, spec.chairman, "chairman", answer)

    if not answer.success:
        error = f"chairman ({spec.chairman}) failed: {answer.error}"
        await _set_run(spec.run_id, status="failed", error=error, completed_at=db.utcnow())
        bus.publish("council.failed", error=error, stage="synthesis")
        return

    bus.publish("synthesis.completed", duration_ms=answer.duration_ms)
    await _set_run(spec.run_id, status="completed", answer=answer.content, completed_at=db.utcnow())
    async with db.session() as s:
        s.add(
            db.Message(
                room_id=(await s.get(db.CouncilRun, spec.run_id)).room_id,
                role="council",
                content=answer.content,
                council_run_id=spec.run_id,
            )
        )
        await s.commit()
    bus.publish("council.completed", answer=answer.content, chairman=spec.chairman)


async def _session_for(room_id: str, provider: str) -> str | None:
    async with db.session() as s:
        row = (
            await s.execute(
                select(db.AgentSession).where(
                    db.AgentSession.room_id == room_id, db.AgentSession.provider == provider
                )
            )
        ).scalar_one_or_none()
    return row.session_id if row else None


async def _remember_session(room_id: str, provider: str, session_id: str) -> None:
    async with db.session() as s:
        row = (
            await s.execute(
                select(db.AgentSession).where(
                    db.AgentSession.room_id == room_id, db.AgentSession.provider == provider
                )
            )
        ).scalar_one_or_none()
        if row is None:
            s.add(db.AgentSession(room_id=room_id, provider=provider, session_id=session_id))
        else:
            row.session_id = session_id
            row.updated_at = db.utcnow()
        await s.commit()


async def _set_run(run_id: str, **fields) -> None:
    async with db.session() as s:
        run = await s.get(db.CouncilRun, run_id)
        if run is None:
            return
        for key, value in fields.items():
            setattr(run, key, value)
        await s.commit()


async def build_history(room_id: str, before_message_id: str) -> list[tuple[str, str]]:
    """Explicit, reproducible conversation context for the providers."""
    async with db.session() as s:
        rows = (
            await s.execute(
                select(db.Message)
                .where(db.Message.room_id == room_id, db.Message.id != before_message_id)
                .order_by(db.Message.created_at)
            )
        ).scalars().all()
    return [(m.role, m.content) for m in rows if m.content.strip()][-MAX_CONTEXT_MESSAGES:]


def known_providers() -> dict[str, str]:
    return provider_labels()
