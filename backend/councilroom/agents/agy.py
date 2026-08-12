"""Google Antigravity CLI adapter."""

from __future__ import annotations

import json
import time
from pathlib import Path

from .base import Agent, AgentResponse, Attachment, run_cli


class AgyAgent(Agent):
    name = "agy"
    label = "Antigravity"
    executable = "agy"

    async def check_authenticated(self) -> bool:
        # `agy models` needs a valid session to fetch the model list.
        result = await run_cli([self.executable, "models"], timeout=60)
        return result.exit_code == 0 and bool(result.stdout.strip())

    async def default_model(self) -> str | None:
        settings = Path.home() / ".gemini/antigravity-cli/settings.json"
        try:
            return json.loads(settings.read_text()).get("model")
        except (OSError, json.JSONDecodeError):
            return None

    async def version(self) -> str | None:
        result = await run_cli([self.executable, "--version"], timeout=30)
        return result.stdout.strip() or None if result.exit_code == 0 else None

    async def list_models(self) -> list[str]:
        result = await run_cli([self.executable, "models"], timeout=60)
        if result.exit_code != 0:
            return []
        models = []
        for line in result.stdout.splitlines():
            ident = line.split("\t")[0].strip()
            if ident and " " not in ident:
                models.append(ident)
        return models

    async def ask(
        self, prompt: str, attachments: list[Attachment], session_id: str | None = None
    ) -> AgentResponse:
        # In headless print mode agy auto-denies the file-read permission, so binary
        # attachments never reach the model. Text attachments are inlined instead.
        # ponytail: drop this once agy exposes a non-interactive read allow-rule.
        binary = [a for a in attachments if a.mime_type != "text/plain"]
        # agy takes the prompt as the value of --print, so use --print=<prompt>.
        argv = [
            self.executable,
            f"--print={self.compose_prompt(prompt, attachments, binary)}",
            "--output-format", "json",
            "--print-timeout", f"{int(self.timeout)}s",
            "--disable-slash-commands",
        ]
        if session_id:
            argv += ["--conversation", session_id]
        if self.model:
            argv += ["--model", self.model]
        if self.effort:
            argv += ["--effort", self.effort]
        if attachments:
            argv += ["--add-dir", str(attachments[0].path.parent)]

        started = time.monotonic()
        cwd = attachments[0].path.parent if attachments else None
        result = await run_cli(argv, timeout=self.timeout + 15, cwd=cwd)
        return self._response(
            result, _extract(result.stdout), started, attachment_supported=not binary,
            session_id=_conversation_id(result.stdout) or session_id,
        )


def _conversation_id(stdout: str) -> str | None:
    try:
        payload = json.loads(stdout)
    except json.JSONDecodeError:
        return None
    return payload.get("conversation_id") if isinstance(payload, dict) else None


def _extract(stdout: str) -> str:
    """`--output-format json` wraps the answer in a `response` field."""
    try:
        payload = json.loads(stdout)
    except json.JSONDecodeError:
        return stdout
    if isinstance(payload, dict) and "response" in payload:
        return payload["response"] or ""  # empty response => treated as a failure
    return stdout
