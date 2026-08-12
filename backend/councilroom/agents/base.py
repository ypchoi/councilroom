"""Common provider adapter interface and subprocess plumbing."""

from __future__ import annotations

import asyncio
import os
import shutil
import signal
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path

MAX_OUTPUT_BYTES = 2 * 1024 * 1024
MAX_INLINE_TEXT_BYTES = 100 * 1024


@dataclass
class Attachment:
    path: Path
    mime_type: str
    filename: str


@dataclass
class AgentResponse:
    provider: str
    content: str
    duration_ms: int
    success: bool
    error: str | None = None
    exit_code: int | None = None
    model: str | None = None
    attachment_supported: bool = True
    session_id: str | None = None


@dataclass
class CliResult:
    exit_code: int | None
    stdout: str
    stderr: str
    timed_out: bool = False


def _decode(raw: bytes) -> str:
    if len(raw) > MAX_OUTPUT_BYTES:
        raw = raw[:MAX_OUTPUT_BYTES] + b"\n...[truncated]"
    return raw.decode("utf-8", errors="replace")


async def run_cli(
    argv: list[str],
    *,
    timeout: float,
    cwd: Path | None = None,
    stdin: str | None = None,
) -> CliResult:
    """Run a CLI with argv (never a shell), capturing stdout/stderr separately."""
    proc = await asyncio.create_subprocess_exec(
        *argv,
        stdin=asyncio.subprocess.PIPE if stdin is not None else asyncio.subprocess.DEVNULL,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        cwd=str(cwd) if cwd else None,
        start_new_session=True,  # own process group, so children die with it
    )
    payload = stdin.encode() if stdin is not None else None
    try:
        out, err = await asyncio.wait_for(proc.communicate(payload), timeout=timeout)
        return CliResult(proc.returncode, _decode(out), _decode(err))
    except (asyncio.TimeoutError, asyncio.CancelledError) as exc:
        _kill_group(proc)
        await proc.wait()  # reap; no zombies
        if isinstance(exc, asyncio.CancelledError):
            raise
        return CliResult(None, "", "", timed_out=True)


def _kill_group(proc: asyncio.subprocess.Process) -> None:
    try:
        os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
    except (ProcessLookupError, PermissionError):
        proc.kill()


class Agent(ABC):
    name: str = ""
    label: str = ""
    executable: str = ""

    def __init__(self, model: str | None = None, effort: str | None = None, timeout: float = 300):
        self.model = model
        self.effort = effort
        self.timeout = timeout

    # --- capability probes -------------------------------------------------
    def path(self) -> str | None:
        return shutil.which(self.executable)

    async def check_available(self) -> bool:
        return self.path() is not None

    @abstractmethod
    async def check_authenticated(self) -> bool: ...

    @abstractmethod
    async def version(self) -> str | None: ...

    async def list_models(self) -> list[str]:
        return []

    async def default_model(self) -> str | None:
        """What the CLI would pick when CouncilRoom passes no --model."""
        return None

    async def account(self) -> str | None:
        """Signed-in identity/plan, when the CLI reports one. Never credentials."""
        return None

    # --- execution ---------------------------------------------------------
    @abstractmethod
    async def ask(
        self, prompt: str, attachments: list[Attachment], session_id: str | None = None
    ) -> AgentResponse:
        """Answer a prompt, resuming `session_id` when the CLI supports it."""

    # --- shared helpers ----------------------------------------------------
    def compose_prompt(
        self, prompt: str, attachments: list[Attachment], handled_natively: list[Attachment] = []
    ) -> str:
        """Inline small text attachments; reference the rest by absolute path."""
        parts = [prompt]
        for att in attachments:
            if att.mime_type == "text/plain":
                try:
                    text = att.path.read_bytes()[:MAX_INLINE_TEXT_BYTES].decode("utf-8", "replace")
                except OSError:
                    continue
                parts.append(f"\n--- attached file: {att.filename} ---\n{text}\n--- end of {att.filename} ---")
        native = {a.path for a in handled_natively}
        paths = [a for a in attachments if a.mime_type != "text/plain" and a.path not in native]
        if paths:
            listed = "\n".join(f"- {a.path} ({a.mime_type}, original name: {a.filename})" for a in paths)
            parts.append(
                "\nThe user attached these files. Read them from disk before answering:\n" + listed
            )
        return "\n".join(parts)

    def _response(
        self,
        result: CliResult,
        content: str,
        started: float,
        *,
        attachment_supported: bool = True,
        session_id: str | None = None,
    ) -> AgentResponse:
        duration = int((time.monotonic() - started) * 1000)
        if result.timed_out:
            return AgentResponse(
                self.name, "", duration, False, error=f"timeout after {self.timeout:.0f}s",
                model=self.model, attachment_supported=attachment_supported, session_id=session_id,
            )
        if result.exit_code != 0 or not content.strip():
            error = (result.stderr or result.stdout or "empty response").strip()[:2000]
            return AgentResponse(
                self.name, "", duration, False, error=error, exit_code=result.exit_code,
                model=self.model, attachment_supported=attachment_supported, session_id=session_id,
            )
        return AgentResponse(
            self.name, content.strip(), duration, True, exit_code=result.exit_code,
            model=self.model, attachment_supported=attachment_supported, session_id=session_id,
        )
