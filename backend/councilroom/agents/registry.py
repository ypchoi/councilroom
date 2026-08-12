"""Provider registry."""

from __future__ import annotations

from ..config import Config, load_config
from .agy import AgyAgent
from .base import Agent, AgentResponse, Attachment
from .claude import ClaudeAgent
from .codex import CodexAgent

AGENT_CLASSES: dict[str, type[Agent]] = {
    "claude": ClaudeAgent,
    "codex": CodexAgent,
    "agy": AgyAgent,
}

__all__ = ["Agent", "AgentResponse", "Attachment", "AGENT_CLASSES", "build_agent", "provider_labels"]


def build_agent(name: str, cfg: Config | None = None) -> Agent:
    cfg = cfg or load_config()
    cls = AGENT_CLASSES[name]
    provider_cfg = cfg.providers.get(name)
    return cls(
        model=provider_cfg.model if provider_cfg else None,
        effort=provider_cfg.effort if provider_cfg else None,
        timeout=cfg.execution.timeout_seconds,
    )


def provider_labels() -> dict[str, str]:
    return {name: cls.label for name, cls in AGENT_CLASSES.items()}
