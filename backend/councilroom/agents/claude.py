"""Claude Code CLI adapter."""

from __future__ import annotations

import json
import time
from pathlib import Path

from .base import Agent, AgentResponse, Attachment, run_cli


class ClaudeAgent(Agent):
    name = "claude"
    label = "Claude"
    executable = "claude"

    async def check_authenticated(self) -> bool:
        result = await run_cli([self.executable, "auth", "status"], timeout=30)
        if result.exit_code != 0:
            return False
        try:
            return bool(json.loads(result.stdout).get("loggedIn"))
        except (json.JSONDecodeError, AttributeError):
            return "logged in" in result.stdout.lower()

    async def account(self) -> str | None:
        result = await run_cli([self.executable, "auth", "status"], timeout=30)
        if result.exit_code != 0:
            return None
        try:
            status = json.loads(result.stdout)
        except json.JSONDecodeError:
            return None
        parts = [status.get("email"), status.get("subscriptionType")]
        return " · ".join(p for p in parts if p) or None

    async def version(self) -> str | None:
        result = await run_cli([self.executable, "--version"], timeout=30)
        return result.stdout.strip() or None if result.exit_code == 0 else None

    async def default_model(self) -> str | None:
        settings = Path.home() / ".claude/settings.json"
        try:
            return json.loads(settings.read_text()).get("model")
        except (OSError, json.JSONDecodeError):
            return None

    async def list_models(self) -> list[str]:
        # The CLI has no list command; these are the aliases it documents for --model.
        return ["fable", "opus", "sonnet", "haiku"]

    async def ask(
        self, prompt: str, attachments: list[Attachment], session_id: str | None = None
    ) -> AgentResponse:
        # Granted here rather than left to whatever this machine's own settings
        # happen to allow: headless has no one to ask, so a tool that is not
        # allowed up front comes back as "I don't have permission to search".
        # codex and agy search without being asked; only this CLI needs telling.
        tools = ["WebSearch", "WebFetch"]
        argv = [self.executable, "-p", "--output-format", "json"]
        if session_id:
            argv += ["--resume", session_id]
        if self.model:
            argv += ["--model", self.model]
        if self.effort:
            argv += ["--effort", self.effort]
        if attachments:
            # Attachments live in their own directory; let Claude read them there.
            argv += ["--add-dir", str(attachments[0].path.parent)]
            tools.append("Read")
        # Variadic, so it goes last — the prompt arrives on stdin, not as a tail.
        argv += ["--allowed-tools", *tools]

        started = time.monotonic()
        # The prompt goes over stdin: several claude flags are variadic and would
        # otherwise swallow a trailing positional prompt.
        result = await run_cli(argv, timeout=self.timeout, stdin=self.compose_prompt(prompt, attachments))
        content = result.stdout
        new_session = session_id
        failure = None
        try:
            payload = json.loads(result.stdout)
            content = payload.get("result", "") or ""
            new_session = payload.get("session_id") or session_id
            # modelUsage is keyed by the model that actually answered.
            used = next(iter(payload.get("modelUsage") or {}), None)
            if used:
                self.model = self.model or used
            if payload.get("is_error"):
                # The CLI reports API failures (529, rate limits) in `result` and
                # still exits 0. That sentence is the error — not the envelope.
                failure, content = content or "claude reported an error", ""
        except json.JSONDecodeError:
            pass
        return self._response(result, content, started, session_id=new_session, error=failure)
