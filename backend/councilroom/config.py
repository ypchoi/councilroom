"""Runtime paths and YAML configuration for CouncilRoom."""

from __future__ import annotations

import os
import secrets
from pathlib import Path
from typing import Literal

import yaml
from pydantic import BaseModel, Field

HOME = Path(os.environ.get("COUNCILROOM_HOME", Path.home() / ".councilroom"))
CONFIG_PATH = HOME / "config.yaml"
DB_PATH = HOME / "councilroom.db"
UPLOADS_DIR = HOME / "uploads"
RUNS_DIR = HOME / "runs"
LOGS_DIR = HOME / "logs"


class TrustedProxy(BaseModel):
    user_header: str = "X-Authenticated-User"
    # Empty = accept the header from any peer. Set to the proxy's IPs in production.
    allowed_ips: list[str] = Field(default_factory=list)
    # Where the proxy ends its own session, since that is what keeps a user signed
    # in. Provider-specific — Cloudflare Access: /cdn-cgi/access/logout,
    # oauth2-proxy: /oauth2/sign_out, Authelia: /logout. Empty hides the button.
    logout_url: str | None = None


class AuthConfig(BaseModel):
    mode: Literal["disabled", "password", "proxy"] = "disabled"
    password_hash: str | None = None
    trusted_proxy: TrustedProxy = Field(default_factory=TrustedProxy)
    session_secret: str = Field(default_factory=lambda: secrets.token_urlsafe(32))


class ProviderConfig(BaseModel):
    model: str | None = None
    effort: str | None = None


class CouncilConfig(BaseModel):
    members: list[str] = Field(default_factory=lambda: ["claude", "codex", "agy"])
    chairman: str = "claude"
    default_mode: Literal["quick", "deep"] = "quick"
    minimum_successful_members: int = 2
    # Reuse each provider's own conversation session per room (claude --resume,
    # codex exec resume, agy --conversation). Off = every turn is a cold session
    # carrying CouncilRoom's reconstructed context.
    resume_sessions: bool = True


class ExecutionConfig(BaseModel):
    timeout_seconds: int = 300


class AttachmentConfig(BaseModel):
    max_files_per_message: int = 10
    max_file_size_mb: int = 25
    allowed_mime_types: list[str] = Field(
        default_factory=lambda: [
            "image/jpeg",
            "image/png",
            "image/webp",
            "application/pdf",
            "text/plain",
        ]
    )


class Config(BaseModel):
    auth: AuthConfig = Field(default_factory=AuthConfig)
    council: CouncilConfig = Field(default_factory=CouncilConfig)
    execution: ExecutionConfig = Field(default_factory=ExecutionConfig)
    attachments: AttachmentConfig = Field(default_factory=AttachmentConfig)
    # Fixed line-up: one tier for every member, so answers are comparable and the
    # quota cost of a council run is predictable. Edit config.yaml to change it.
    providers: dict[str, ProviderConfig] = Field(
        default_factory=lambda: {
            "claude": ProviderConfig(model="sonnet", effort="medium"),
            "codex": ProviderConfig(model="gpt-5.6-terra", effort="medium"),
            # agy encodes the effort tier in the model id.
            "agy": ProviderConfig(model="gemini-3.6-flash-medium"),
        }
    )


_cached: Config | None = None


def ensure_dirs() -> None:
    for d in (HOME, UPLOADS_DIR, RUNS_DIR, LOGS_DIR):
        d.mkdir(parents=True, exist_ok=True)
    HOME.chmod(0o700)


def load_config(reload: bool = False) -> Config:
    global _cached
    if _cached is not None and not reload:
        return _cached
    ensure_dirs()
    if CONFIG_PATH.exists():
        data = yaml.safe_load(CONFIG_PATH.read_text()) or {}
        cfg = Config.model_validate(data)
    else:
        cfg = Config()
        save_config(cfg)
    _cached = cfg
    return cfg


def save_config(cfg: Config) -> Config:
    global _cached
    ensure_dirs()
    CONFIG_PATH.write_text(yaml.safe_dump(cfg.model_dump(), sort_keys=False))
    CONFIG_PATH.chmod(0o600)
    _cached = cfg
    return cfg
