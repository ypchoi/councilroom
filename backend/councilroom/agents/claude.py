"""Claude Code CLI adapter."""

from __future__ import annotations

import json
import time

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

    async def list_models(self) -> list[str]:
        # The CLI has no list command; these are the aliases it documents for --model.
        return ["fable", "opus", "sonnet", "haiku"]

    async def ask(self, prompt: str, attachments: list[Attachment]) -> AgentResponse:
        argv = [self.executable, "-p", "--output-format", "json"]
        if self.model:
            argv += ["--model", self.model]
        if attachments:
            # Attachments live in their own directory; let Claude read them there.
            argv += ["--add-dir", str(attachments[0].path.parent), "--allowed-tools", "Read"]

        started = time.monotonic()
        # The prompt goes over stdin: several claude flags are variadic and would
        # otherwise swallow a trailing positional prompt.
        result = await run_cli(argv, timeout=self.timeout, stdin=self.compose_prompt(prompt, attachments))
        content = result.stdout
        try:
            payload = json.loads(result.stdout)
            content = payload.get("result", "") or ""
            if payload.get("is_error"):
                content = ""
        except json.JSONDecodeError:
            pass
        return self._response(result, content, started)
