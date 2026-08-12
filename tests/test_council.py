"""End-to-end API test with stubbed providers (no real CLI calls)."""

from __future__ import annotations

import os
import tempfile

import pytest

TMP_HOME = tempfile.mkdtemp(prefix="councilroom-test-")
os.environ["COUNCILROOM_HOME"] = TMP_HOME

import httpx  # noqa: E402

from councilroom import db  # noqa: E402
from councilroom.agents import registry  # noqa: E402
from councilroom.agents.base import Agent, AgentResponse  # noqa: E402
from councilroom.main import create_app  # noqa: E402


class StubAgent(Agent):
    answer = "stub answer"
    fails = False

    async def check_authenticated(self) -> bool:
        return True

    async def version(self) -> str | None:
        return "0.0-stub"

    async def ask(self, prompt: str, attachments) -> AgentResponse:
        if self.fails:
            return AgentResponse(self.name, "", 5, False, error="stub failure")
        seen = "|".join(a.filename for a in attachments)
        return AgentResponse(self.name, f"{self.answer} from {self.name} [{seen}] :: {prompt[-40:]}", 5, True)


def make_stub(name: str, *, fails: bool = False, answer: str = "stub answer") -> type[Agent]:
    return type(
        f"Stub{name}", (StubAgent,),
        {"name": name, "label": name.title(), "executable": "true", "fails": fails, "answer": answer},
    )


@pytest.fixture(autouse=True)
def stub_providers():
    original = dict(registry.AGENT_CLASSES)
    registry.AGENT_CLASSES.clear()
    registry.AGENT_CLASSES.update({n: make_stub(n) for n in ("claude", "codex", "agy")})
    yield registry.AGENT_CLASSES
    registry.AGENT_CLASSES.clear()
    registry.AGENT_CLASSES.update(original)


@pytest.fixture
async def client():
    app = create_app()
    await db.init_db()
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


async def _drain(client: httpx.AsyncClient, run_id: str) -> list[str]:
    events = []
    async with client.stream("GET", f"/api/runs/{run_id}/events", timeout=30) as response:
        async for line in response.aiter_lines():
            if line.startswith("event: "):
                events.append(line.removeprefix("event: "))
                if events[-1] in ("council.completed", "council.failed"):
                    break
    return events


async def test_quick_council_end_to_end(client):
    room = (await client.post("/api/rooms", json={"title": "New room"})).json()

    files = {"file": ("notes.txt", b"the sky is green", "text/plain")}
    upload = await client.post("/api/attachments", data={"room_id": room["id"]}, files=files)
    assert upload.status_code == 200, upload.text

    started = await client.post(
        f"/api/rooms/{room['id']}/messages",
        json={"content": "What colour is the sky?", "attachment_ids": [upload.json()["id"]]},
    )
    assert started.status_code == 200, started.text
    run_id = started.json()["run_id"]

    events = await _drain(client, run_id)
    assert events[0] == "council.started"
    assert events.count("agent.completed") == 3
    assert "synthesis.completed" in events
    assert events[-1] == "council.completed"

    run = (await client.get(f"/api/runs/{run_id}")).json()
    assert run["status"] == "completed"
    assert "stub answer from claude" in run["answer"]
    assert len(run["responses"]) == 4  # 3 members + chairman
    assert all(r["attachment_supported"] for r in run["responses"])

    messages = (await client.get(f"/api/rooms/{room['id']}/messages")).json()
    assert [m["role"] for m in messages] == ["user", "council"]
    assert messages[0]["attachments"][0]["filename"] == "notes.txt"

    rooms = (await client.get("/api/rooms")).json()
    assert rooms[0]["title"] == "What colour is the sky?"  # auto-titled from the question


async def test_deep_council_runs_peer_review(client):
    room = (await client.post("/api/rooms", json={})).json()
    started = await client.post(
        f"/api/rooms/{room['id']}/messages", json={"content": "Compare A and B", "mode": "deep"}
    )
    events = await _drain(client, started.json()["run_id"])
    assert "peer_review.completed" in events
    run = (await client.get(f"/api/runs/{started.json()['run_id']}")).json()
    assert len(run["peer_reviews"]) == 3
    assert run["status"] == "completed"


async def test_failure_below_minimum_members(client, stub_providers):
    stub_providers["codex"] = make_stub("codex", fails=True)
    stub_providers["agy"] = make_stub("agy", fails=True)

    room = (await client.post("/api/rooms", json={})).json()
    started = await client.post(f"/api/rooms/{room['id']}/messages", json={"content": "hi"})
    run_id = started.json()["run_id"]
    events = await _drain(client, run_id)
    assert events[-1] == "council.failed"

    run = (await client.get(f"/api/runs/{run_id}")).json()
    assert run["status"] == "failed"
    assert "minimum 2" in run["error"]

    # retry with a healthy council succeeds and keeps the same message
    stub_providers["codex"] = make_stub("codex")
    stub_providers["agy"] = make_stub("agy")
    retry = (await client.post(f"/api/runs/{run_id}/retry", json={"chairman": "codex"})).json()
    assert (await _drain(client, retry["run_id"]))[-1] == "council.completed"
    assert retry["message_id"] == started.json()["message_id"]


async def test_upload_rejects_unsupported_type(client):
    room = (await client.post("/api/rooms", json={})).json()
    files = {"file": ("evil.sh", b"#!/bin/sh\nrm -rf /", "application/x-sh")}
    response = await client.post("/api/attachments", data={"room_id": room["id"]}, files=files)
    assert response.status_code == 415
