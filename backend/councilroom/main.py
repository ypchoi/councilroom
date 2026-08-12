"""FastAPI application: API + bundled frontend."""

from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware

from . import db
from .api import router
from .config import load_config

STATIC_DIR = Path(__file__).parent / "static"


@asynccontextmanager
async def lifespan(app: FastAPI):
    await db.init_db()
    yield


def create_app() -> FastAPI:
    cfg = load_config()
    app = FastAPI(title="CouncilRoom", lifespan=lifespan)
    app.add_middleware(
        SessionMiddleware, secret_key=cfg.auth.session_secret, https_only=False, same_site="lax"
    )
    app.include_router(router)

    if STATIC_DIR.is_dir():
        app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="assets")

        @app.get("/{path:path}")
        async def spa(path: str, request: Request):
            candidate = (STATIC_DIR / path).resolve()
            if path and candidate.is_file() and candidate.is_relative_to(STATIC_DIR.resolve()):
                return FileResponse(candidate)
            return FileResponse(STATIC_DIR / "index.html")
    else:

        @app.get("/")
        async def missing_frontend():
            return JSONResponse(
                {"detail": "frontend not built; run `npm run build` in frontend/"}, status_code=200
            )

    return app


app = create_app()
