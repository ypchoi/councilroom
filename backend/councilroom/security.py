"""Authentication: disabled / password / trusted reverse proxy."""

from __future__ import annotations

import hashlib
import secrets

from fastapi import HTTPException, Request
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from . import db
from .config import load_config

PBKDF2_ROUNDS = 240_000


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), PBKDF2_ROUNDS)
    return f"pbkdf2_sha256${PBKDF2_ROUNDS}${salt}${digest.hex()}"


def verify_password(password: str, stored: str | None) -> bool:
    if not stored:
        return False
    try:
        algo, rounds, salt, digest = stored.split("$")
    except ValueError:
        return False
    if algo != "pbkdf2_sha256":
        return False
    candidate = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), int(rounds))
    return secrets.compare_digest(candidate.hex(), digest)


def _proxy_username(request: Request) -> str | None:
    cfg = load_config().auth
    allowed = cfg.trusted_proxy.allowed_ips
    if allowed and (request.client.host if request.client else None) not in allowed:
        return None  # header only counts when it comes from a trusted peer
    return request.headers.get(cfg.trusted_proxy.user_header) or None


def resolve_username(request: Request) -> str | None:
    mode = load_config().auth.mode
    if mode == "disabled":
        return "local"
    if mode == "proxy":
        return _proxy_username(request)
    return request.session.get("user")


async def get_or_create_user(username: str) -> db.User:
    async with db.session() as s:
        query = select(db.User).where(db.User.username == username)
        user = (await s.execute(query)).scalar_one_or_none()
        if user is not None:
            return user
        s.add(db.User(username=username))
        try:
            await s.commit()
        except IntegrityError:
            # A first visit fires several API calls at once and each of them
            # finds no user yet; whichever insert loses just reads the winner's.
            await s.rollback()
        return (await s.execute(query)).scalar_one()


async def current_user(request: Request) -> db.User:
    username = resolve_username(request)
    if not username:
        raise HTTPException(status_code=401, detail="not authenticated")
    return await get_or_create_user(username)
