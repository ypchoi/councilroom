"""OpenAI Codex CLI adapter."""

from __future__ import annotations

import json
import tempfile
import time
from pathlib import Path

from .base import Agent, AgentResponse, Attachment, run_cli

IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}


class CodexAgent(Agent):
    name = "codex"
    label = "Codex"
    executable = "codex"

    async def check_authenticated(self) -> bool:
        result = await run_cli([self.executable, "login", "status"], timeout=30)
        # codex prints the status line on stderr.
        return result.exit_code == 0 and "logged in" in (result.stdout + result.stderr).lower()

    async def default_model(self) -> str | None:
        config = Path.home() / ".codex/config.toml"
        try:
            for line in config.read_text().splitlines():
                if line.startswith("model ") or line.startswith("model="):
                    return line.split("=", 1)[1].strip().strip('"')
        except OSError:
            return None
        return None

    async def account(self) -> str | None:
        result = await run_cli([self.executable, "login", "status"], timeout=30)
        line = (result.stdout + result.stderr).strip().splitlines()
        return line[0] if result.exit_code == 0 and line else None

    async def version(self) -> str | None:
        result = await run_cli([self.executable, "--version"], timeout=30)
        return result.stdout.strip() or None if result.exit_code == 0 else None

    async def ask(
        self, prompt: str, attachments: list[Attachment], session_id: str | None = None
    ) -> AgentResponse:
        images = [a for a in attachments if a.mime_type in IMAGE_TYPES]
        with tempfile.TemporaryDirectory(prefix="councilroom-codex-") as tmp:
            last_message = Path(tmp) / "answer.txt"
            # Sessions are persisted (no --ephemeral) so later turns can resume them.
            argv = [self.executable, "exec"]
            if session_id:
                argv += ["resume", session_id]
            for img in images:  # --image is variadic, so keep it away from the tail
                argv += ["--image", str(img.path)]
            if self.model:
                argv += ["--model", self.model]
            if self.effort:  # codex has no --effort flag; it is a config key
                argv += ["-c", f"model_reasoning_effort={self.effort}"]
            argv += ["--skip-git-repo-check", "--json", "--output-last-message", str(last_message)]
            if not session_id:  # these flags only exist on a fresh exec
                argv += ["--color", "never", "--sandbox", "read-only"]
            argv.append("-")  # read the prompt from stdin

            started = time.monotonic()
            cwd = attachments[0].path.parent if attachments else None
            result = await run_cli(
                argv, timeout=self.timeout, cwd=cwd,
                stdin=self.compose_prompt(prompt, attachments, images),
            )
            content = last_message.read_text() if last_message.exists() else ""
        return self._response(
            result, content, started, session_id=_thread_id(result.stdout) or session_id
        )


def _thread_id(stdout: str) -> str | None:
    """`--json` announces the session as a thread.started event."""
    for line in stdout.splitlines():
        if '"thread.started"' not in line:
            continue
        try:
            return json.loads(line).get("thread_id")
        except json.JSONDecodeError:
            return None
    return None
