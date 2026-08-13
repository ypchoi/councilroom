"""SQLite persistence: schema, engine and session helper."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import ForeignKey, Integer, String, Text, Boolean, DateTime, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

from .config import DB_PATH, ensure_dirs


def new_id() -> str:
    return uuid.uuid4().hex


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    username: Mapped[str] = mapped_column(String(255), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Room(Base):
    __tablename__ = "rooms"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(String(32), index=True)
    title: Mapped[str] = mapped_column(String(255), default="New room")
    # Set only while the room is shared; knowing it is enough to read the room.
    share_token: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)


class Message(Base):
    __tablename__ = "messages"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    room_id: Mapped[str] = mapped_column(ForeignKey("rooms.id", ondelete="CASCADE"), index=True)
    role: Mapped[str] = mapped_column(String(16))  # user | council
    content: Mapped[str] = mapped_column(Text, default="")
    council_run_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    attachments: Mapped[list["Attachment"]] = relationship(lazy="selectin")


class Attachment(Base):
    __tablename__ = "attachments"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    message_id: Mapped[str | None] = mapped_column(
        ForeignKey("messages.id", ondelete="CASCADE"), nullable=True, index=True
    )
    room_id: Mapped[str] = mapped_column(String(32), index=True)
    filename: Mapped[str] = mapped_column(String(255))
    mime_type: Mapped[str] = mapped_column(String(100))
    size: Mapped[int] = mapped_column(Integer)
    stored_path: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class CouncilRun(Base):
    __tablename__ = "council_runs"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    room_id: Mapped[str] = mapped_column(String(32), index=True)
    user_id: Mapped[str] = mapped_column(String(32))
    message_id: Mapped[str] = mapped_column(String(32))
    mode: Mapped[str] = mapped_column(String(16), default="quick")
    status: Mapped[str] = mapped_column(String(16), default="pending")  # pending|running|completed|failed
    chairman_provider: Mapped[str] = mapped_column(String(32))
    answer: Mapped[str] = mapped_column(Text, default="")
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class AgentRun(Base):
    __tablename__ = "agent_runs"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    council_run_id: Mapped[str] = mapped_column(String(32), index=True)
    provider: Mapped[str] = mapped_column(String(32))
    model: Mapped[str | None] = mapped_column(String(100), nullable=True)
    role: Mapped[str] = mapped_column(String(16), default="member")  # member|chairman
    status: Mapped[str] = mapped_column(String(16), default="running")
    content: Mapped[str] = mapped_column(Text, default="")
    attachment_supported: Mapped[bool] = mapped_column(Boolean, default=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    duration_ms: Mapped[int] = mapped_column(Integer, default=0)
    exit_code: Mapped[int | None] = mapped_column(Integer, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)


class PeerReview(Base):
    __tablename__ = "peer_reviews"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    council_run_id: Mapped[str] = mapped_column(String(32), index=True)
    reviewer_provider: Mapped[str] = mapped_column(String(32))
    content: Mapped[str] = mapped_column(Text, default="")
    duration_ms: Mapped[int] = mapped_column(Integer, default=0)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class AgentSession(Base):
    """Provider-side conversation handle for one room member."""

    __tablename__ = "agent_sessions"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    room_id: Mapped[str] = mapped_column(String(32), index=True)
    provider: Mapped[str] = mapped_column(String(32))
    session_id: Mapped[str] = mapped_column(String(128))
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)


_engine = None
_sessionmaker: async_sessionmaker[AsyncSession] | None = None


def engine():
    global _engine, _sessionmaker
    if _engine is None:
        ensure_dirs()
        _engine = create_async_engine(f"sqlite+aiosqlite:///{DB_PATH}", future=True)
        _sessionmaker = async_sessionmaker(_engine, expire_on_commit=False)
    return _engine


def session() -> AsyncSession:
    engine()
    assert _sessionmaker is not None
    return _sessionmaker()


async def fail_interrupted_runs() -> int:
    """Close the runs a restart took with it.

    A run lives in an asyncio task, so stopping the process ends it mid-flight and
    leaves the row saying "running" — which the room shows as a council still
    thinking, forever. Nothing can be running in a process that has only just
    started, so every such row belongs to a run that will never come back.
    """
    async with session() as s:
        closed = await s.execute(
            update(CouncilRun)
            .where(CouncilRun.status.in_(("pending", "running")))
            .values(
                status="failed",
                error="interrupted by a server restart — ask again or retry",
                completed_at=utcnow(),
            )
        )
        await s.commit()
        return closed.rowcount


async def init_db() -> None:
    async with engine().begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # create_all only creates missing tables, never alters existing ones.
        columns = {row[1] for row in await conn.exec_driver_sql("PRAGMA table_info(rooms)")}
        if "share_token" not in columns:
            await conn.exec_driver_sql("ALTER TABLE rooms ADD COLUMN share_token VARCHAR(64)")
