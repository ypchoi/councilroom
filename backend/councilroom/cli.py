"""`councilroom` command line: doctor, serve, set-password."""

from __future__ import annotations

import argparse
import asyncio
import getpass
import sys

from .agents.registry import AGENT_CLASSES, build_agent
from .config import CONFIG_PATH, DB_PATH, HOME, UPLOADS_DIR, load_config, save_config

OK, BAD = "✓", "✕"


async def _doctor() -> bool:
    from .main import STATIC_DIR

    cfg = load_config()
    print("CouncilRoom Doctor\n")
    print("Providers")
    print("─" * 32)
    healthy = True
    for name in AGENT_CLASSES:
        agent = build_agent(name, cfg)
        available = await agent.check_available()
        authenticated = await agent.check_authenticated() if available else False
        print(agent.label)
        print(f"  {OK if available else BAD} installed")
        print(f"  {OK if authenticated else BAD} authenticated")
        if available:
            print(f"  version: {await agent.version() or 'unknown'}")
        print()
        healthy = healthy and available and authenticated

    print("System")
    print("─" * 32)
    checks = {
        "Database": DB_PATH.parent.is_dir(),
        "Storage": HOME.is_dir(),
        "Uploads": UPLOADS_DIR.is_dir(),
        "Frontend": STATIC_DIR.is_dir(),
    }
    for label, ok in checks.items():
        print(f"{label:<14} {OK if ok else BAD}")
    healthy = healthy and all(checks.values())
    print()
    print("CouncilRoom is ready." if healthy else "CouncilRoom has problems (see above).")
    return healthy


def _set_password() -> None:
    from .security import hash_password

    password = getpass.getpass("New password: ")
    if password != getpass.getpass("Repeat: "):
        sys.exit("passwords do not match")
    cfg = load_config()
    cfg.auth.mode = "password"
    cfg.auth.password_hash = hash_password(password)
    save_config(cfg)
    print(f"password auth enabled ({CONFIG_PATH})")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="councilroom", description="Multi-model AI council")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("doctor", help="check providers and storage")
    serve = sub.add_parser("serve", help="run the web application")
    serve.add_argument("--host", default="127.0.0.1")
    serve.add_argument("--port", type=int, default=8420)
    serve.add_argument("--reload", action="store_true")
    sub.add_parser("set-password", help="enable password auth and set the password")

    args = parser.parse_args(argv)
    if args.command == "doctor":
        return 0 if asyncio.run(_doctor()) else 1
    if args.command == "set-password":
        _set_password()
        return 0

    import uvicorn

    load_config()
    uvicorn.run(
        "councilroom.main:app", host=args.host, port=args.port, reload=args.reload
    )
    return 0
