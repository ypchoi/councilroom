"""HTTP API: rooms, messages, attachments, council runs, providers, settings, auth."""

from __future__ import annotations

import asyncio
import json
import mimetypes
import shutil
import time
from pathlib import Path
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
from sqlalchemy import case, delete, func, select

from . import council, db, security, usage
from .agents.base import Attachment as AgentAttachment
from .agents.registry import AGENT_CLASSES, build_agent
from .config import UPLOADS_DIR, Config, load_config, save_config

router = APIRouter(prefix="/api")
CurrentUser = Depends(security.current_user)


# --------------------------------------------------------------------------
# auth
# --------------------------------------------------------------------------
class LoginBody(BaseModel):
    password: str


@router.post("/auth/login")
async def login(body: LoginBody, request: Request):
    cfg = load_config()
    if cfg.auth.mode != "password":
        raise HTTPException(status_code=400, detail="password auth is not enabled")
    if not security.verify_password(body.password, cfg.auth.password_hash):
        raise HTTPException(status_code=401, detail="invalid password")
    request.session["user"] = "owner"
    return {"ok": True}


@router.post("/auth/logout")
async def logout(request: Request):
    request.session.clear()
    return {"ok": True}


@router.get("/auth/me")
async def me(request: Request):
    username = security.resolve_username(request)
    return {"mode": load_config().auth.mode, "authenticated": bool(username), "username": username}


# --------------------------------------------------------------------------
# providers & settings
# --------------------------------------------------------------------------
PROBE_TTL_SECONDS = 60
_probe_cache: dict[str, tuple[float, dict]] = {}


async def _probe(name: str, cfg: Config) -> dict:
    """Provider facts that cost a CLI spawn each — cached, they change rarely."""
    cached = _probe_cache.get(name)
    if cached and time.monotonic() - cached[0] < PROBE_TTL_SECONDS:
        return cached[1]

    agent = build_agent(name, cfg)
    available = await agent.check_available()
    authenticated = await agent.check_authenticated() if available else False
    facts = {
        "name": name,
        "label": agent.label,
        "available": available,
        "authenticated": authenticated,
        "version": await agent.version() if available else None,
        "models": await agent.list_models() if authenticated else [],
        "account": await agent.account() if authenticated else None,
        "default_model": await agent.default_model() if available else None,
    }
    _probe_cache[name] = (time.monotonic(), facts)
    return facts


@router.get("/providers")
async def providers(user: db.User = CurrentUser):
    cfg = load_config()
    facts = await asyncio.gather(*[_probe(name, cfg) for name in AGENT_CLASSES])
    return [{k: v for k, v in f.items() if k != "default_model"} for f in facts]


@router.get("/usage")
async def usage_panel(user: db.User = CurrentUser):
    """Per-member status: account, subscription quota (when a delegate reports it), our own calls."""
    cfg = load_config()
    quotas = await usage.quota()

    async with db.session() as s:
        rows = (
            await s.execute(
                select(
                    db.AgentRun.provider,
                    func.count(db.AgentRun.id),
                    func.sum(case((db.AgentRun.status == "completed", 1), else_=0)),
                    func.max(db.AgentRun.completed_at),
                )
                .join(db.CouncilRun, db.CouncilRun.id == db.AgentRun.council_run_id)
                .where(db.CouncilRun.user_id == user.id)
                .group_by(db.AgentRun.provider)
            )
        ).all()
    counts = {provider: (total, ok or 0, last) for provider, total, ok, last in rows}

    async def describe(name: str):
        facts = await _probe(name, cfg)
        configured = cfg.providers.get(name)
        total, ok, last = counts.get(name, (0, 0, None))
        return {
            **{k: facts[k] for k in ("name", "label", "available", "authenticated", "account")},
            "model": (configured.model if configured else None) or facts["default_model"],
            "model_is_default": not (configured and configured.model),
            "effort": configured.effort if configured else None,
            "quota": quotas.get(name),
            "calls": total,
            "failures": total - ok,
            "last_used": last,
            "is_member": name in cfg.council.members,
            "is_chairman": name == cfg.council.chairman,
        }

    return {
        "providers": await asyncio.gather(*[describe(name) for name in AGENT_CLASSES]),
        "quota_source": "claude-dashboard" if quotas else None,
    }


@router.get("/config")
async def get_config(user: db.User = CurrentUser):
    cfg = load_config().model_dump()
    cfg["auth"] = {"mode": cfg["auth"]["mode"]}  # never expose secrets
    return cfg


@router.put("/config")
async def put_config(body: dict, user: db.User = CurrentUser):
    current = load_config()
    body.pop("auth", None)  # auth is configured from the CLI, not the browser
    merged = Config.model_validate({**current.model_dump(), **body, "auth": current.auth.model_dump()})
    save_config(merged)
    return await get_config(user)


# --------------------------------------------------------------------------
# rooms & messages
# --------------------------------------------------------------------------
class RoomBody(BaseModel):
    title: str = "New room"


@router.get("/rooms")
async def list_rooms(user: db.User = CurrentUser):
    async with db.session() as s:
        rows = (
            await s.execute(
                select(db.Room).where(db.Room.user_id == user.id).order_by(db.Room.updated_at.desc())
            )
        ).scalars().all()
    return [{"id": r.id, "title": r.title, "updated_at": r.updated_at} for r in rows]


@router.post("/rooms")
async def create_room(body: RoomBody, user: db.User = CurrentUser):
    async with db.session() as s:
        room = db.Room(user_id=user.id, title=body.title)
        s.add(room)
        await s.commit()
    return {"id": room.id, "title": room.title, "updated_at": room.updated_at}


@router.patch("/rooms/{room_id}")
async def rename_room(room_id: str, body: RoomBody, user: db.User = CurrentUser):
    async with db.session() as s:
        room = await _room(s, room_id, user)
        room.title = body.title
        await s.commit()
    return {"id": room.id, "title": room.title}


@router.delete("/rooms/{room_id}")
async def delete_room(room_id: str, user: db.User = CurrentUser):
    async with db.session() as s:
        room = await _room(s, room_id, user)
        for att in (
            await s.execute(select(db.Attachment).where(db.Attachment.room_id == room.id))
        ).scalars().all():
            shutil.rmtree(UPLOADS_DIR / att.id, ignore_errors=True)
        await s.execute(delete(db.Attachment).where(db.Attachment.room_id == room.id))
        await s.execute(delete(db.Message).where(db.Message.room_id == room.id))
        await s.delete(room)
        await s.commit()
    return {"ok": True}


async def _room(s, room_id: str, user: db.User) -> db.Room:
    room = await s.get(db.Room, room_id)
    if room is None or room.user_id != user.id:
        raise HTTPException(status_code=404, detail="room not found")
    return room


@router.get("/rooms/{room_id}/messages")
async def list_messages(room_id: str, user: db.User = CurrentUser):
    async with db.session() as s:
        await _room(s, room_id, user)
        rows = (
            await s.execute(
                select(db.Message).where(db.Message.room_id == room_id).order_by(db.Message.created_at)
            )
        ).scalars().all()
        return [
            {
                "id": m.id,
                "role": m.role,
                "content": m.content,
                "council_run_id": m.council_run_id,
                "created_at": m.created_at,
                "attachments": [
                    {"id": a.id, "filename": a.filename, "mime_type": a.mime_type, "size": a.size}
                    for a in m.attachments
                ],
            }
            for m in rows
        ]


# --------------------------------------------------------------------------
# attachments
# --------------------------------------------------------------------------
@router.post("/attachments")
async def upload(
    room_id: str = Form(...), file: UploadFile = File(...), user: db.User = CurrentUser
):
    cfg = load_config().attachments
    async with db.session() as s:
        await _room(s, room_id, user)

    mime = file.content_type or mimetypes.guess_type(file.filename or "")[0] or ""
    if mime not in cfg.allowed_mime_types:
        raise HTTPException(status_code=415, detail=f"unsupported file type: {mime or 'unknown'}")

    attachment = db.Attachment(
        id=db.new_id(),
        room_id=room_id,
        filename=(file.filename or "file")[:255],
        mime_type=mime,
        size=0,
        stored_path="",
    )
    # Client filenames are never used as paths: id + mime-derived extension only.
    folder = UPLOADS_DIR / attachment.id
    folder.mkdir(parents=True, exist_ok=True)
    target = folder / f"{attachment.id}{mimetypes.guess_extension(mime) or '.bin'}"

    limit = cfg.max_file_size_mb * 1024 * 1024
    size = 0
    with target.open("wb") as out:
        while chunk := await file.read(1024 * 1024):
            size += len(chunk)
            if size > limit:
                out.close()
                shutil.rmtree(folder, ignore_errors=True)
                raise HTTPException(status_code=413, detail=f"file exceeds {cfg.max_file_size_mb} MB")
            out.write(chunk)
    target.chmod(0o600)  # stored uploads are never executable

    attachment.size = size
    attachment.stored_path = str(target)
    async with db.session() as s:
        s.add(attachment)
        await s.commit()
    return {"id": attachment.id, "filename": attachment.filename, "mime_type": mime, "size": size}


@router.get("/attachments/{attachment_id}")
async def download(attachment_id: str, user: db.User = CurrentUser):
    async with db.session() as s:
        attachment = await s.get(db.Attachment, attachment_id)
        if attachment is None:
            raise HTTPException(status_code=404, detail="attachment not found")
        await _room(s, attachment.room_id, user)  # ownership, not just knowledge of the id

    path = Path(attachment.stored_path)
    if not path.is_file() or UPLOADS_DIR.resolve() not in path.resolve().parents:
        raise HTTPException(status_code=404, detail="file is gone")

    # Images and PDFs are worth previewing; anything else downloads.
    inline = attachment.mime_type.startswith("image/") or attachment.mime_type == "application/pdf"
    quoted = quote(attachment.filename)
    return FileResponse(
        path,
        media_type=attachment.mime_type,
        headers={
            "Content-Disposition": f"{'inline' if inline else 'attachment'}; filename*=UTF-8''{quoted}",
            "Cache-Control": "private, max-age=86400",
        },
    )


# --------------------------------------------------------------------------
# council
# --------------------------------------------------------------------------
class AskBody(BaseModel):
    content: str
    attachment_ids: list[str] = []
    mode: str | None = None
    chairman: str | None = None
    members: list[str] | None = None


@router.post("/rooms/{room_id}/messages")
async def ask(room_id: str, body: AskBody, user: db.User = CurrentUser):
    cfg = load_config()
    limits = cfg.attachments
    if len(body.attachment_ids) > limits.max_files_per_message:
        raise HTTPException(status_code=400, detail=f"at most {limits.max_files_per_message} files")
    if not body.content.strip() and not body.attachment_ids:
        raise HTTPException(status_code=400, detail="empty message")

    mode = body.mode or cfg.council.default_mode
    chairman = body.chairman or cfg.council.chairman
    members = body.members or cfg.council.members
    unknown = [m for m in [*members, chairman] if m not in AGENT_CLASSES]
    if unknown:
        raise HTTPException(status_code=400, detail=f"unknown provider(s): {', '.join(unknown)}")
    if not members:
        raise HTTPException(status_code=400, detail="no council members selected")

    async with db.session() as s:
        room = await _room(s, room_id, user)
        message = db.Message(id=db.new_id(), room_id=room_id, role="user", content=body.content)
        s.add(message)
        attachments = []
        for att_id in body.attachment_ids:
            att = await s.get(db.Attachment, att_id)
            if att is None or att.room_id != room_id:
                raise HTTPException(status_code=404, detail=f"attachment not found: {att_id}")
            att.message_id = message.id
            attachments.append(att)
        if room.title == "New room" and body.content.strip():
            room.title = body.content.strip()[:60]
        room.updated_at = db.utcnow()
        run = db.CouncilRun(
            id=db.new_id(), room_id=room_id, user_id=user.id, message_id=message.id,
            mode=mode, chairman_provider=chairman,
        )
        s.add(run)
        await s.commit()
        agent_attachments = [
            AgentAttachment(path=Path(a.stored_path), mime_type=a.mime_type, filename=a.filename)
            for a in attachments
        ]

    spec = council.RunInput(
        run_id=run.id,
        room_id=room_id,
        question=body.content,
        history=await council.build_history(room_id, message.id),
        attachments=agent_attachments,
        members=members,
        chairman=chairman,
        mode=mode,
    )
    council.bus_for(run.id)
    asyncio.create_task(council.execute(spec, cfg))
    return {"message_id": message.id, "run_id": run.id, "mode": mode, "chairman": chairman}


@router.get("/runs/{run_id}")
async def get_run(run_id: str, user: db.User = CurrentUser):
    async with db.session() as s:
        run = await s.get(db.CouncilRun, run_id)
        if run is None or run.user_id != user.id:
            raise HTTPException(status_code=404, detail="run not found")
        agent_runs = (
            await s.execute(select(db.AgentRun).where(db.AgentRun.council_run_id == run_id))
        ).scalars().all()
        reviews = (
            await s.execute(select(db.PeerReview).where(db.PeerReview.council_run_id == run_id))
        ).scalars().all()
    return {
        "id": run.id,
        "room_id": run.room_id,
        "message_id": run.message_id,
        "mode": run.mode,
        "status": run.status,
        "chairman": run.chairman_provider,
        "answer": run.answer,
        "error": run.error,
        "responses": [
            {
                "provider": a.provider, "role": a.role, "status": a.status, "model": a.model,
                "content": a.content, "error": a.error, "duration_ms": a.duration_ms,
                "attachment_supported": a.attachment_supported,
            }
            for a in agent_runs
        ],
        "peer_reviews": [
            {"reviewer": p.reviewer_provider, "content": p.content, "error": p.error}
            for p in reviews
        ],
    }


class RetryBody(BaseModel):
    chairman: str | None = None


@router.post("/runs/{run_id}/retry")
async def retry(run_id: str, body: RetryBody, user: db.User = CurrentUser):
    cfg = load_config()
    async with db.session() as s:
        old = await s.get(db.CouncilRun, run_id)
        if old is None or old.user_id != user.id:
            raise HTTPException(status_code=404, detail="run not found")
        message = await s.get(db.Message, old.message_id)
        if message is None:
            raise HTTPException(status_code=404, detail="message not found")
        chairman = body.chairman or old.chairman_provider
        if chairman not in AGENT_CLASSES:
            raise HTTPException(status_code=400, detail=f"unknown provider: {chairman}")
        run = db.CouncilRun(
            id=db.new_id(), room_id=old.room_id, user_id=user.id, message_id=message.id,
            mode=old.mode, chairman_provider=chairman,
        )
        s.add(run)
        await s.commit()
        attachments = [
            AgentAttachment(path=Path(a.stored_path), mime_type=a.mime_type, filename=a.filename)
            for a in message.attachments
        ]

    spec = council.RunInput(
        run_id=run.id,
        room_id=old.room_id,
        question=message.content,
        history=await council.build_history(old.room_id, message.id),
        attachments=attachments,
        members=cfg.council.members,
        chairman=chairman,
        mode=old.mode,
    )
    council.bus_for(run.id)
    asyncio.create_task(council.execute(spec, cfg))
    return {"run_id": run.id, "message_id": message.id, "chairman": chairman}


@router.get("/runs/{run_id}/events")
async def events(run_id: str, user: db.User = CurrentUser):
    async with db.session() as s:
        run = await s.get(db.CouncilRun, run_id)
        if run is None or run.user_id != user.id:
            raise HTTPException(status_code=404, detail="run not found")

    async def generate():
        stream = council.bus_for(run_id).stream()
        while True:
            try:
                payload = await asyncio.wait_for(anext(stream), timeout=15)
            except asyncio.TimeoutError:
                yield ": keepalive\n\n"  # keep proxies from dropping an idle stream
                continue
            except StopAsyncIteration:
                return
            yield f"event: {payload['event']}\ndata: {json.dumps(payload, default=str)}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
