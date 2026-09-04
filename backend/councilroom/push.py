"""Web Push: the VAPID pair, the phones subscribed to it, and what a finished
run says to them.

A notification does not travel from here to the phone. It goes through the push
service the browser named when it subscribed — Google's, for Chrome — which is
why two different keys are involved. The VAPID pair proves to that service which
server is sending, so nobody who learns an endpoint URL can push to it; the pair
of keys the browser handed over encrypts the payload, so the service relaying it
cannot read the question or the answer it carries.
"""

from __future__ import annotations

import asyncio
import base64
import json
import logging

from cryptography.hazmat.primitives import serialization
from py_vapid import Vapid02
from pywebpush import WebPushException, webpush_async
from sqlalchemy import delete, select

from . import db
from .config import load_config, save_config

log = logging.getLogger(__name__)

# How far into the answer the notification quotes before trailing off.
PREVIEW_CHARS = 120


def _generate() -> tuple[str, str]:
    vapid = Vapid02()
    vapid.generate_keys()
    raw = vapid.public_key.public_bytes(
        serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint
    )
    return vapid.private_pem().decode(), base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def keys() -> tuple[str, str]:
    """The deployment's VAPID pair, generated and saved on first use."""
    cfg = load_config()
    if not (cfg.push.vapid_private_key and cfg.push.vapid_public_key):
        cfg.push.vapid_private_key, cfg.push.vapid_public_key = _generate()
        save_config(cfg)
    return cfg.push.vapid_private_key, cfg.push.vapid_public_key


def public_key() -> str:
    """What the browser must be given to subscribe. Safe to hand out."""
    return keys()[1]


async def subscribe(user_id: str, endpoint: str, p256dh: str, auth: str) -> None:
    async with db.session() as s:
        existing = (
            await s.execute(
                select(db.PushSubscription).where(db.PushSubscription.endpoint == endpoint)
            )
        ).scalar_one_or_none()
        # A reinstalled browser keeps its endpoint but may belong to someone else
        # now, so the row moves rather than being duplicated.
        if existing is not None:
            existing.user_id, existing.p256dh, existing.auth = user_id, p256dh, auth
        else:
            s.add(
                db.PushSubscription(
                    user_id=user_id, endpoint=endpoint, p256dh=p256dh, auth=auth
                )
            )
        await s.commit()


async def unsubscribe(endpoint: str) -> None:
    async with db.session() as s:
        await s.execute(delete(db.PushSubscription).where(db.PushSubscription.endpoint == endpoint))
        await s.commit()


async def _send(sub: dict, payload: str, private_key: str, contact: str) -> None:
    try:
        await webpush_async(
            subscription_info={
                "endpoint": sub["endpoint"],
                "keys": {"p256dh": sub["p256dh"], "auth": sub["auth"]},
            },
            data=payload,
            vapid_private_key=private_key,
            vapid_claims={"sub": contact},
            ttl=600,
            # The library's own default is measured in the thousands of seconds,
            # which is no timeout at all for something a finished run waits on.
            timeout=10,
        )
    except WebPushException as exc:
        # 404/410 is the push service saying this browser is gone for good —
        # anything else (a timeout, a 5xx) may work again next time, so it stays.
        if getattr(exc, "status_code", None) in (404, 410):
            await unsubscribe(sub["endpoint"])
        else:
            log.warning("push to %s failed: %s", sub["endpoint"][:40], exc)
    except Exception as exc:  # noqa: BLE001 — a notification must never fail a run
        log.warning("push to %s failed: %s", sub["endpoint"][:40], exc)


async def prepare(run_id: str, answer: str | None, error: str | None) -> tuple[list[dict], str]:
    """Everything the notification needs, read while the run is still the only
    one holding the database: who to reach, and what to say.

    Split from the sending on purpose. The reader is waiting for the answer, so
    the run publishes it and only then goes out to the push service — but the
    lookups have to be done by that point, or a finished run is still touching
    the database while the next thing is trying to write to it.
    """
    empty: tuple[list[dict], str] = ([], "")
    try:
        cfg = load_config()
        if not cfg.push.enabled:
            return empty
        async with db.session() as s:
            run = await s.get(db.CouncilRun, run_id)
            room = await s.get(db.Room, run.room_id) if run else None
            if room is None:
                return empty
            subs = list(
                (
                    await s.execute(
                        select(db.PushSubscription).where(db.PushSubscription.user_id == room.user_id)
                    )
                ).scalars()
            )
            if not subs:
                return empty
            # The room's own title, and either the start of the answer or the same
            # error text the card shows — the interface's words live in i18n.ts,
            # so nothing here invents prose of its own.
            body = (error or answer or "").strip().replace("\n", " ")
            if len(body) > PREVIEW_CHARS:
                body = body[:PREVIEW_CHARS].rstrip() + "…"
            payload = json.dumps({"title": room.title, "body": body, "url": f"/r/{room.id}"})
            return (
                [{"endpoint": x.endpoint, "p256dh": x.p256dh, "auth": x.auth} for x in subs],
                payload,
            )
    except Exception as exc:  # noqa: BLE001 — a notification must never fail a run
        log.warning("could not prepare a notification for run %s: %s", run_id, exc)
        return empty


async def deliver(prepared: tuple[list[dict], str]) -> int:
    """Send what prepare() gathered. Network only — nothing here reads the
    database, so it is safe to run after the answer has already gone out."""
    subs, payload = prepared
    if not subs:
        return 0
    try:
        private_key, _ = keys()
        cfg = load_config()
    except Exception as exc:  # noqa: BLE001
        log.warning("no VAPID key to send with: %s", exc)
        return 0
    await asyncio.gather(*(_send(sub, payload, private_key, cfg.push.contact) for sub in subs))
    return len(subs)
