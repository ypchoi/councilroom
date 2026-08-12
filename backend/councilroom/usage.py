"""Subscription quota, delegated to the user's claude-dashboard plugin.

CouncilRoom never reads provider OAuth credentials itself (SPEC §1). The
claude-dashboard plugin already owns that responsibility, so when it is
installed we shell out to its `check-usage --json` and report what it returns.
Without it, quota is simply unavailable and the UI says so.
"""

from __future__ import annotations

import json
import shutil
import time
from pathlib import Path

from .agents.base import run_cli

CACHE_TTL_SECONDS = 60
SCRIPT_GLOB = ".claude/plugins/cache/claude-dashboard/claude-dashboard/*/dist/check-usage.js"

# Antigravity has no entry in check-usage output, so it stays quota-less.
PROVIDER_KEYS = {"claude": "claude", "codex": "codex"}

_cache: tuple[float, dict] = (0.0, {})


def _script() -> Path | None:
    candidates = sorted(Path.home().glob(SCRIPT_GLOB))
    return candidates[-1] if candidates else None  # ponytail: lexicographic version sort


async def quota(force: bool = False) -> dict:
    """{provider: {five_hour_percent, seven_day_percent, ...}} — empty when unavailable."""
    global _cache
    fetched_at, cached = _cache
    if not force and cached and time.monotonic() - fetched_at < CACHE_TTL_SECONDS:
        return cached

    script = _script()
    node = shutil.which("node")
    if script is None or node is None:
        return {}

    result = await run_cli([node, str(script), "--json"], timeout=60)
    if result.exit_code != 0:
        return {}
    try:
        payload = json.loads(result.stdout)
    except json.JSONDecodeError:
        return {}

    parsed = {}
    for provider, key in PROVIDER_KEYS.items():
        entry = payload.get(key)
        if not isinstance(entry, dict) or entry.get("error") or not entry.get("available"):
            continue
        parsed[provider] = {
            "five_hour_percent": entry.get("fiveHourPercent"),
            "seven_day_percent": entry.get("sevenDayPercent"),
            "five_hour_reset": entry.get("fiveHourReset"),
            "seven_day_reset": entry.get("sevenDayReset"),
            "plan": entry.get("plan"),
        }
    _cache = (time.monotonic(), parsed)
    return parsed
