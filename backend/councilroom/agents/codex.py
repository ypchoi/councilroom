"""OpenAI Codex CLI adapter."""

from __future__ import annotations

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

    async def version(self) -> str | None:
        result = await run_cli([self.executable, "--version"], timeout=30)
        return result.stdout.strip() or None if result.exit_code == 0 else None

    async def ask(self, prompt: str, attachments: list[Attachment]) -> AgentResponse:
        images = [a for a in attachments if a.mime_type in IMAGE_TYPES]
        with tempfile.TemporaryDirectory(prefix="councilroom-codex-") as tmp:
            last_message = Path(tmp) / "answer.txt"
            argv = [self.executable, "exec"]
            for img in images:  # --image is variadic, so keep it away from the tail
                argv += ["--image", str(img.path)]
            if self.model:
                argv += ["--model", self.model]
            argv += [
                "--skip-git-repo-check", "--ephemeral",
                "--color", "never",
                "--sandbox", "read-only",
                "--output-last-message", str(last_message),
                "-",  # read the prompt from stdin
            ]

            started = time.monotonic()
            cwd = attachments[0].path.parent if attachments else None
            result = await run_cli(
                argv, timeout=self.timeout, cwd=cwd,
                stdin=self.compose_prompt(prompt, attachments, images),
            )
            content = last_message.read_text() if last_message.exists() else ""
        return self._response(result, content, started)
