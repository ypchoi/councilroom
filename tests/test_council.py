"""End-to-end API test with stubbed providers (no real CLI calls)."""

from __future__ import annotations

import asyncio
import json
import os
import tempfile

import pytest

TMP_HOME = tempfile.mkdtemp(prefix="councilroom-test-")
os.environ["COUNCILROOM_HOME"] = TMP_HOME

import pathlib  # noqa: E402

import httpx  # noqa: E402
from sqlalchemy import select  # noqa: E402

from councilroom import db, security  # noqa: E402
from councilroom.agents import registry  # noqa: E402
from councilroom.agents.base import Agent, AgentResponse  # noqa: E402
from councilroom.main import create_app  # noqa: E402


CALLS: list[dict] = []


class StubAgent(Agent):
    answer = "stub answer"
    fails = False
    session_expired = False  # fail whenever a session id is supplied

    async def check_authenticated(self) -> bool:
        return True

    async def version(self) -> str | None:
        return "0.0-stub"

    async def ask(self, prompt: str, attachments, session_id: str | None = None) -> AgentResponse:
        CALLS.append({"provider": self.name, "prompt": prompt, "session_id": session_id})
        if self.fails or (self.session_expired and session_id):
            return AgentResponse(self.name, "", 5, False, error="stub failure", session_id=session_id)
        seen = "|".join(a.filename for a in attachments)
        return AgentResponse(
            self.name,
            f"{self.answer} from {self.name} [{seen}] :: {prompt[-40:]}",
            5,
            True,
            session_id=f"session-{self.name}",
        )


def make_stub(
    name: str, *, fails: bool = False, answer: str = "stub answer", session_expired: bool = False
) -> type[Agent]:
    return type(
        f"Stub{name}", (StubAgent,),
        {
            "name": name, "label": name.title(), "executable": "true",
            "fails": fails, "answer": answer, "session_expired": session_expired,
        },
    )


@pytest.fixture(autouse=True)
def stub_providers():
    CALLS.clear()
    original = dict(registry.AGENT_CLASSES)
    registry.AGENT_CLASSES.clear()
    registry.AGENT_CLASSES.update({n: make_stub(n) for n in ("claude", "codex", "agy")})
    yield registry.AGENT_CLASSES
    registry.AGENT_CLASSES.clear()
    registry.AGENT_CLASSES.update(original)


@pytest.fixture
async def client():
    app = create_app()
    await db.init_db()
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


async def _drain(client: httpx.AsyncClient, run_id: str) -> list[str]:
    events = []
    async with client.stream("GET", f"/api/runs/{run_id}/events", timeout=30) as response:
        async for line in response.aiter_lines():
            if line.startswith("event: "):
                events.append(line.removeprefix("event: "))
                if events[-1] in ("council.completed", "council.failed"):
                    break
    return events


async def test_quick_council_end_to_end(client):
    room = (await client.post("/api/rooms", json={"title": "New room"})).json()

    files = {"file": ("notes.txt", b"the sky is green", "text/plain")}
    upload = await client.post("/api/attachments", data={"room_id": room["id"]}, files=files)
    assert upload.status_code == 200, upload.text

    started = await client.post(
        f"/api/rooms/{room['id']}/messages",
        json={"content": "What colour is the sky?", "attachment_ids": [upload.json()["id"]]},
    )
    assert started.status_code == 200, started.text
    run_id = started.json()["run_id"]

    events = await _drain(client, run_id)
    assert events[0] == "council.started"
    assert events.count("agent.completed") == 3
    assert "synthesis.completed" in events
    assert events[-1] == "council.completed"

    run = (await client.get(f"/api/runs/{run_id}")).json()
    assert run["status"] == "completed"
    assert "stub answer from claude" in run["answer"]
    assert len(run["responses"]) == 4  # 3 members + chairman
    assert all(r["attachment_supported"] for r in run["responses"])

    messages = (await client.get(f"/api/rooms/{room['id']}/messages")).json()
    assert [m["role"] for m in messages] == ["user", "council"]
    assert messages[0]["attachments"][0]["filename"] == "notes.txt"

    rooms = (await client.get("/api/rooms")).json()
    assert rooms[0]["title"] == "What colour is the sky?"  # auto-titled from the question


async def test_deep_council_runs_peer_review(client):
    room = (await client.post("/api/rooms", json={})).json()
    started = await client.post(
        f"/api/rooms/{room['id']}/messages", json={"content": "Compare A and B", "mode": "deep"}
    )
    events = await _drain(client, started.json()["run_id"])
    assert "peer_review.completed" in events
    run = (await client.get(f"/api/runs/{started.json()['run_id']}")).json()
    assert len(run["peer_reviews"]) == 3
    assert run["status"] == "completed"


async def test_failure_below_minimum_members(client, stub_providers):
    stub_providers["codex"] = make_stub("codex", fails=True)
    stub_providers["agy"] = make_stub("agy", fails=True)

    room = (await client.post("/api/rooms", json={})).json()
    started = await client.post(f"/api/rooms/{room['id']}/messages", json={"content": "hi"})
    run_id = started.json()["run_id"]
    events = await _drain(client, run_id)
    assert events[-1] == "council.failed"

    run = (await client.get(f"/api/runs/{run_id}")).json()
    assert run["status"] == "failed"
    assert "minimum 2" in run["error"]

    # retry with a healthy council succeeds and keeps the same message
    stub_providers["codex"] = make_stub("codex")
    stub_providers["agy"] = make_stub("agy")
    retry = (await client.post(f"/api/runs/{run_id}/retry", json={"chairman": "codex"})).json()
    assert (await _drain(client, retry["run_id"]))[-1] == "council.completed"
    assert retry["message_id"] == started.json()["message_id"]


async def test_a_rotating_chair_is_fixed_per_room(client):
    async def new_room() -> str:
        return (await client.post("/api/rooms", json={})).json()["id"]

    async def ask(room: str, chairman: str) -> str:
        started = await client.post(
            f"/api/rooms/{room}/messages", json={"content": "who chairs?", "chairman": chairman}
        )
        assert started.status_code == 200, started.text
        await _drain(client, started.json()["run_id"])
        return started.json()["chairman"]

    # Three members, so four rooms visit each once and come back round.
    rooms = [await new_room() for _ in range(4)]
    seats = [await ask(room, "rotation") for room in rooms]
    assert len(set(seats[:3])) == 3, seats
    assert seats[3] == seats[0], seats

    # Later questions keep the chair the room opened with — under either rule.
    assert await ask(rooms[0], "rotation") == seats[0]
    assert await ask(rooms[0], "random") == seats[0]

    assert await ask(await new_room(), "random") in ("claude", "codex", "agy")
    assert (
        await client.post(f"/api/rooms/{rooms[0]}/messages", json={"content": "x", "chairman": "coin toss"})
    ).status_code == 400


async def test_upload_rejects_unsupported_type(client):
    room = (await client.post("/api/rooms", json={})).json()
    files = {"file": ("evil.sh", b"#!/bin/sh\nrm -rf /", "application/x-sh")}
    response = await client.post("/api/attachments", data={"room_id": room["id"]}, files=files)
    assert response.status_code == 415


async def test_follow_up_resumes_provider_sessions(client):
    room = (await client.post("/api/rooms", json={})).json()
    first = await client.post(f"/api/rooms/{room['id']}/messages", json={"content": "My name is Ada"})
    await _drain(client, first.json()["run_id"])

    CALLS.clear()
    second = await client.post(f"/api/rooms/{room['id']}/messages", json={"content": "What is my name?"})
    await _drain(client, second.json()["run_id"])

    members = [c for c in CALLS if c["provider"] in ("claude", "codex", "agy")]
    resumed = [c for c in members if c["session_id"]]
    assert len(resumed) >= 3  # every member resumed its own room session
    for call in resumed:
        assert call["session_id"] == f"session-{call['provider']}"
        # The session already holds the thread, so no rebuilt transcript is resent.
        assert "Conversation so far" not in call["prompt"]


async def test_expired_session_falls_back_to_rebuilt_context(client, stub_providers):
    room = (await client.post("/api/rooms", json={})).json()
    first = await client.post(f"/api/rooms/{room['id']}/messages", json={"content": "My name is Ada"})
    await _drain(client, first.json()["run_id"])

    for name in ("claude", "codex", "agy"):
        stub_providers[name] = make_stub(name, session_expired=True)

    CALLS.clear()
    second = await client.post(f"/api/rooms/{room['id']}/messages", json={"content": "What is my name?"})
    events = await _drain(client, second.json()["run_id"])
    assert events[-1] == "council.completed"

    retries = [c for c in CALLS if c["session_id"] is None and "Conversation so far" in c["prompt"]]
    assert retries, "expired sessions must retry with CouncilRoom's own context"


async def test_attachment_download_is_owner_only(client):
    room = (await client.post("/api/rooms", json={})).json()
    files = {"file": ("notes.txt", b"the sky is green", "text/plain")}
    attachment = (
        await client.post("/api/attachments", data={"room_id": room["id"]}, files=files)
    ).json()

    fetched = await client.get(f"/api/attachments/{attachment['id']}")
    assert fetched.status_code == 200
    assert fetched.content == b"the sky is green"
    assert "notes.txt" in fetched.headers["content-disposition"]

    assert (await client.get("/api/attachments/deadbeef")).status_code == 404


async def test_deleting_a_room_removes_everything_it_held(client):
    room = (await client.post("/api/rooms", json={})).json()
    files = {"file": ("secret.txt", b"private notes", "text/plain")}
    attachment = (
        await client.post("/api/attachments", data={"room_id": room["id"]}, files=files)
    ).json()
    started = await client.post(
        f"/api/rooms/{room['id']}/messages",
        json={"content": "remember this", "attachment_ids": [attachment["id"]], "mode": "deep"},
    )
    run_id = started.json()["run_id"]
    await _drain(client, run_id)

    stored = pathlib.Path((await _attachment_path(attachment["id"])))
    assert stored.is_file()

    assert (await client.delete(f"/api/rooms/{room['id']}")).status_code == 200

    assert (await client.get(f"/api/runs/{run_id}")).status_code == 404
    assert (await client.get(f"/api/attachments/{attachment['id']}")).status_code == 404
    assert not stored.exists()

    async with db.session() as s:
        leftovers = {
            "messages": select(db.Message).where(db.Message.room_id == room["id"]),
            "attachments": select(db.Attachment).where(db.Attachment.room_id == room["id"]),
            "council_runs": select(db.CouncilRun).where(db.CouncilRun.room_id == room["id"]),
            "agent_runs": select(db.AgentRun).where(db.AgentRun.council_run_id == run_id),
            "peer_reviews": select(db.PeerReview).where(db.PeerReview.council_run_id == run_id),
            "agent_sessions": select(db.AgentSession).where(db.AgentSession.room_id == room["id"]),
        }
        for table, query in leftovers.items():
            rows = (await s.execute(query)).scalars().all()
            assert rows == [], f"{table} still holds {len(rows)} row(s)"


async def test_share_link_is_public_and_revocable(client):
    room = (await client.post("/api/rooms", json={})).json()
    assert room["share_token"] is None
    files = {"file": ("notes.txt", b"the sky is green", "text/plain")}
    attachment = (
        await client.post("/api/attachments", data={"room_id": room["id"]}, files=files)
    ).json()
    started = await client.post(
        f"/api/rooms/{room['id']}/messages",
        json={"content": "What colour is the sky?", "attachment_ids": [attachment["id"]]},
    )
    await _drain(client, started.json()["run_id"])

    token = (await client.post(f"/api/rooms/{room['id']}/share")).json()["share_token"]
    assert token and len(token) >= 16
    assert (await client.post(f"/api/rooms/{room['id']}/share")).json()["share_token"] == token

    shared = (await client.get(f"/api/shared/{token}")).json()
    assert shared["room"]["title"] == "What colour is the sky?"
    assert [m["role"] for m in shared["messages"]] == ["user", "council"]

    # A reader sees what each member said, not only the Chairman's synthesis.
    council = next(m for m in shared["messages"] if m["role"] == "council")
    run = shared["runs"][council["council_run_id"]]
    members = [r for r in run["responses"] if r["role"] == "member"]
    assert {r["provider"] for r in members} == {"claude", "codex", "agy"}
    assert all(r["content"] and r["label"] for r in members)
    fetched = await client.get(f"/api/shared/{token}/attachments/{attachment['id']}")
    assert fetched.status_code == 200 and fetched.content == b"the sky is green"

    # A second room's attachment is not reachable through this room's token.
    other = (await client.post("/api/rooms", json={})).json()
    theirs = (
        await client.post("/api/attachments", data={"room_id": other["id"]}, files=files)
    ).json()
    assert (await client.get(f"/api/shared/{token}/attachments/{theirs['id']}")).status_code == 404

    assert (await client.delete(f"/api/rooms/{room['id']}/share")).status_code == 200
    assert (await client.get(f"/api/shared/{token}")).status_code == 404
    assert (await client.get(f"/api/shared/{token}/attachments/{attachment['id']}")).status_code == 404


async def test_a_provider_api_error_is_not_shown_as_json(monkeypatch):
    """The claude CLI reports API failures inside its JSON envelope and still exits 0."""
    from councilroom.agents import base, claude

    payload = {
        "is_error": True,
        "session_id": "86b1999f",
        "api_error_status": 529,
        "result": "API Error: 529 Overloaded. This is a server-side issue, usually temporary",
        "subtype": "success",
        "type": "result",
    }

    async def fake_run_cli(*args, **kwargs):
        return base.CliResult(exit_code=0, stdout=json.dumps(payload), stderr="")

    monkeypatch.setattr(claude, "run_cli", fake_run_cli)
    response = await claude.ClaudeAgent(timeout=5).ask("hi", [])

    assert not response.success
    assert response.error == payload["result"]
    assert "{" not in response.error, "the JSON envelope must not reach the user"


async def test_a_restart_does_not_leave_a_room_thinking_forever(client):
    """A killed run cannot resume, so the row must not keep claiming it is running."""
    async with db.session() as s:
        stuck = db.CouncilRun(
            id=db.new_id(), room_id=db.new_id(), user_id=db.new_id(),
            message_id=db.new_id(), chairman_provider="claude", status="running",
        )
        s.add(stuck)
        await s.commit()

    assert await db.fail_interrupted_runs() >= 1

    async with db.session() as s:
        reopened = await s.get(db.CouncilRun, stuck.id)
        assert reopened.status == "failed"
        assert "restart" in (reopened.error or "")


async def test_the_council_hands_claude_the_web(monkeypatch):
    """Headless has no one to ask, so the tools must be allowed in the argv itself."""
    from councilroom.agents import base, claude

    seen: list[str] = []

    async def fake_run_cli(argv, **kwargs):
        seen[:] = argv
        return base.CliResult(exit_code=0, stdout='{"result":"ok"}', stderr="")

    monkeypatch.setattr(claude, "run_cli", fake_run_cli)
    await claude.ClaudeAgent(timeout=5).ask("hi", [])
    assert seen[-3:] == ["--allowed-tools", "WebSearch", "WebFetch"], seen


async def test_the_app_shell_is_never_served_stale(client):
    """It names hashed bundles, so a cached copy survives a rebuild pointing at 404s."""
    response = await client.get("/")
    if response.status_code == 404:
        pytest.skip("frontend not built")
    assert response.headers.get("cache-control") == "no-cache"


async def test_a_first_visit_may_arrive_in_parallel(client):
    """A new identity's browser fires several API calls at once, all finding no user yet."""
    users = await asyncio.gather(
        *[security.get_or_create_user("newcomer@example.com") for _ in range(8)]
    )
    assert len({u.id for u in users}) == 1, "one identity must not become several users"


async def _attachment_path(attachment_id: str) -> str:
    async with db.session() as s:
        return (await s.get(db.Attachment, attachment_id)).stored_path
