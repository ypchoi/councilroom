# CouncilRoom — Product & Technical Specification

> **One question. Multiple models. One considered answer.**

## 1. Overview

**CouncilRoom** is a self-hosted, mobile-friendly multi-model AI chat application.

A user asks one question, optionally attaches images/files, and CouncilRoom independently asks multiple authenticated AI CLI providers in parallel.

The responses are then synthesized by a selected Chairman model into one final answer.

```text
User
 │
 │ Question + Images / Files
 ▼
CouncilRoom
 │
 ├───────────────┬───────────────┐
 ▼               ▼               ▼
Claude CLI     Codex CLI       AGY CLI
 │               │               │
 └───────────────┼───────────────┘
                 ▼
              Chairman
                 │
                 ▼
        Final Council Answer
```

CouncilRoom should primarily use the user's **existing AI subscriptions through their official authenticated CLIs**.

Initial providers:

* Claude Code CLI — `claude`
* OpenAI Codex CLI — `codex`
* Google Antigravity CLI — `agy`

The primary workflow must NOT require separate Anthropic, OpenAI, or Google API keys.

CouncilRoom must not extract, copy, inspect, or directly manipulate OAuth credentials.

Authentication remains the responsibility of each official CLI.

---

## 2. Product Philosophy

CouncilRoom is an **AI chat application**, not a coding-agent orchestrator.

The intended experience is similar to a modern AI chat application:

1. Open CouncilRoom.
2. Type a question.
3. Optionally attach images/files.
4. Send.
5. Multiple models independently analyze the same request.
6. CouncilRoom synthesizes their responses.
7. The user primarily sees one final answer.
8. Individual model responses remain available for inspection.

The orchestration should mostly be invisible to the user.

---

## 3. Primary Goals

CouncilRoom must support:

* Chat-style interface
* Mobile-first responsive UI
* Android browser/PWA usage
* Multiple conversations ("Rooms")
* Multiple image attachments
* File attachments
* Parallel multi-model execution
* Independent first-round responses
* Configurable Chairman
* Automatic synthesis
* Optional peer review / Deep Council
* Individual response inspection
* Conversation history
* Streaming execution status
* Existing CLI subscription authentication
* Headless Ubuntu deployment
* Single-user operation
* Small trusted multi-user deployments
* Reverse-proxy authentication integration

---

## 4. Non-Goals

CouncilRoom is NOT intended to be:

* an autonomous coding agent
* an IDE
* a Git worktree manager
* a pull-request automation system
* an OpenClaw plugin
* a SaaS platform
* an API-key resale/proxy service
* a replacement for Claude/Codex/Antigravity authentication
* a DNS manager
* a TLS certificate manager
* a reverse proxy
* a VPN
* an identity provider

Do not introduce agent frameworks such as LangGraph/CrewAI unless a concrete requirement later justifies them.

The core orchestration is simple enough to implement directly.

---

## 5. Target Environment

Primary server:

```text
Ubuntu Server
├── CouncilRoom
├── claude
├── codex
└── agy
```

Supported clients:

```text
Android
Desktop Browser
Tablet
PWA
```

CouncilRoom must work on a headless Ubuntu server.

---

## 6. Technology Stack

### Backend

Use:

* Python 3.12+
* FastAPI
* Uvicorn
* asyncio
* Pydantic
* SQLAlchemy 2.x
* SQLite

Avoid unnecessary infrastructure.

Do NOT require:

* Redis
* Celery
* RabbitMQ
* PostgreSQL

for the initial release.

---

## 7. CLI Process Execution

Use:

```python
asyncio.create_subprocess_exec()
```

Provider commands must be executed using argv arrays.

Example:

```python
process = await asyncio.create_subprocess_exec(
    executable,
    *args,
    stdout=asyncio.subprocess.PIPE,
    stderr=asyncio.subprocess.PIPE,
)
```

Avoid:

```python
create_subprocess_shell()
```

especially with user-controlled content.

Requirements:

* capture stdout
* capture stderr separately
* configurable timeout
* cancellation support
* process cleanup
* no zombie processes
* safe handling of large outputs

---

## 8. Frontend

Use:

* React
* TypeScript
* Vite
* Tailwind CSS
* PWA support

Design mobile-first.

Do NOT use Streamlit or Gradio as the primary frontend.

The frontend should eventually feel comparable to a modern consumer AI chat interface.

---

## 9. Distribution

CouncilRoom should appear to users as one application.

Desired installation:

```bash
pipx install councilroom
```

Then:

```bash
councilroom doctor
councilroom serve
```

The React frontend should be compiled to static assets and bundled with the Python package.

The FastAPI application should serve the frontend.

`backend/councilroom/static/` is a build output and is gitignored, which the build backend reads as
"exclude me"; `tool.hatch.build.artifacts` puts it back into the wheel. The bundle must therefore
be built before the wheel is, or the release installs a server with no UI.

Published as `councilroom` on PyPI; `pipx install councilroom` needs no Node and no build step.

Docker may be provided later as an optional deployment method.

Docker should NOT be required because authenticated provider CLIs normally live on the host.

---

## 10. Runtime Files

Default:

```text
~/.councilroom/
├── councilroom.db
├── config.yaml
├── uploads/
├── runs/
└── logs/
```

Provider OAuth credentials must never be copied into this directory.

---

## 11. Repository Structure

```text
councilroom/
├── backend/
│   └── councilroom/
│       ├── main.py          FastAPI app, static mount, SPA fallback
│       ├── cli.py           doctor / serve / set-password
│       ├── api.py           HTTP routes, including the SSE stream
│       ├── council.py       quick + deep orchestration, event fan-out
│       ├── db.py            SQLAlchemy models, engine, session
│       ├── config.py        paths, config.yaml load/save
│       ├── security.py      auth modes, password hashing
│       ├── usage.py         subscription quota, via claude-dashboard
│       │
│       ├── agents/
│       │   ├── base.py      Agent ABC, run_cli, Attachment/AgentResponse
│       │   ├── claude.py
│       │   ├── codex.py
│       │   ├── agy.py
│       │   └── registry.py
│       │
│       └── static/          built frontend — generated, not committed
│
├── frontend/
│   ├── src/
│   ├── public/
│   └── package.json
│
├── scripts/                 install-service.sh, restart.sh, reset.sh
├── tests/
├── pyproject.toml
├── README.md
└── LICENSE
```

Modules stay flat: one file per concern. A concern earns its own package when it outgrows a file,
not before — splitting `api.py` or `council.py` is a later move, not a starting shape.

---

## 12. Provider Abstraction

Providers must implement a common interface.

Example:

```python
from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path


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


class Agent(ABC):
    name: str = ""
    label: str = ""
    executable: str = ""

    def __init__(self, model: str | None = None, effort: str | None = None, timeout: float = 300):
        ...

    # capability probes
    async def check_available(self) -> bool: ...          # shutil.which(executable)

    @abstractmethod
    async def check_authenticated(self) -> bool: ...

    @abstractmethod
    async def version(self) -> str | None: ...

    async def list_models(self) -> list[str]: ...
    async def default_model(self) -> str | None: ...      # what the CLI picks with no --model
    async def account(self) -> str | None: ...            # signed-in identity/plan, never secrets

    # execution
    @abstractmethod
    async def ask(
        self,
        prompt: str,
        attachments: list[Attachment],
        session_id: str | None = None,
    ) -> AgentResponse:
        ...
```

Shared, non-abstract helpers live on the base class: `compose_prompt()` (inlines small text
attachments, references the rest by absolute path) and `_response()` (turns a `CliResult` into an
`AgentResponse`, including the timeout and empty-output cases).

Provider-specific command syntax must remain inside provider adapters.

The Council engine must not know how individual CLIs are invoked.

---

## 13. Initial Providers

### Claude

Executable:

```text
claude
```

Use the authenticated Claude Code CLI.

---

### Codex

Executable:

```text
codex
```

Use the authenticated Codex CLI.

---

### Antigravity

Executable:

```text
agy
```

AGY supports non-interactive execution such as:

```bash
agy -p "prompt"
```

Available capabilities include:

```text
--model
--effort
--output-format
--json-schema
--print-timeout
```

Prefer structured/machine-readable output where it improves reliability.

---

## 14. Provider Independence

Do NOT assume:

```text
Claude CLI == Codex CLI == AGY CLI
```

Each provider adapter must independently implement:

* prompt invocation
* model selection
* timeout handling
* attachment handling
* structured output parsing
* error parsing
* authentication detection
* version detection

---

## 15. Doctor Command

Implement:

```bash
councilroom doctor
```

Example:

```text
CouncilRoom Doctor

Providers
────────────────────────────────
Claude
  ✓ installed
  ✓ authenticated
  version: ...

Codex
  ✓ installed
  ✓ authenticated
  version: ...

Antigravity
  ✓ installed
  ✓ authenticated
  version: ...

System
────────────────────────────────
Database       ✓
Storage        ✓
Uploads        ✓
Frontend       ✓

CouncilRoom is ready.
```

Never display credential contents.

---

## 16. Quick Council

Quick Council is the default mode.

Workflow:

```text
                 Question
                    │
        ┌───────────┼───────────┐
        ▼           ▼           ▼
     Claude       Codex        AGY
        │           │           │
        └───────────┼───────────┘
                    ▼
                 Chairman
                    │
                    ▼
             Council Answer
```

All member requests must execute concurrently.

Conceptually:

```python
responses = await asyncio.gather(
    *[
        member.ask(prompt, attachments)
        for member in members
    ],
    return_exceptions=True,
)
```

First-round responses must be independent.

---

## 17. Deep Council

Deep Council provides higher-quality deliberation.

Workflow:

```text
ROUND 1

Claude ─┐
Codex  ─┼── Independent answers
AGY    ─┘

        ↓

ROUND 2

Anonymous peer review

Claude reviews B/C
Codex reviews A/C
AGY reviews A/B

        ↓

CHAIRMAN

Original Question
+
Independent Answers
+
Peer Reviews

        ↓

FINAL ANSWER
```

Deep Council consumes substantially more subscription quota and should not be the default.

---

## 18. Anonymized Peer Review

Before peer review:

```text
Claude
Codex
Antigravity
```

must be converted to anonymous labels:

```text
Response A
Response B
Response C
```

Randomize ordering for each review where practical.

Store provider mappings internally.

The reviewing model should evaluate:

* factual correctness
* reasoning quality
* missing considerations
* unsupported claims
* useful unique insights
* disagreements

---

## 19. Chairman

Users must be able to choose the synthesis provider.

Example:

```text
Chairman

● Claude
○ Codex
○ Antigravity
```

The Chairman receives:

* original user request
* attachment context where appropriate
* successful independent responses
* peer reviews in Deep mode

The Chairman should:

1. identify consensus
2. identify disagreements
3. resolve conflicts where possible
4. preserve useful minority observations
5. avoid blindly majority-voting factual claims
6. produce one coherent final answer
7. write the final answer in the same language the user asked in

Do not simply concatenate responses.

The same language rule applies to member answers as well: each member replies in the
language of the question, so the Chairman's synthesis stays consistent with what was
asked. English question → English answer, Korean question → Korean answer.

---

## 20. Failure Handling

Provider failures must degrade gracefully.

Example:

```text
Claude        ✓  9.2s
Codex         ✓  12.1s
Antigravity   ✕  timeout

Continuing with 2/3 members.
```

Default:

```text
minimum_successful_members = 2
```

Make configurable.

If fewer than the required number succeeds:

* stop synthesis
* show provider errors
* allow retry

If the Chairman fails:

* allow retry
* allow another provider to become Chairman
* preserve individual responses

---

## 21. Attachments

Attachments are a first-class feature.

Initial supported formats:

```text
image/jpeg
image/png
image/webp
application/pdf
text/plain
```

UI requirements:

* Android camera/gallery picker
* multiple images
* multiple files
* attachment preview
* remove before send
* upload progress

Default limits:

```text
max_files_per_message = 10
max_file_size = 25 MB
```

Make configurable.

---

## 22. Attachment Storage

Store uploads under:

```text
~/.councilroom/uploads/
```

Use generated IDs.

Example:

```text
~/.councilroom/uploads/
└── 018f.../
    ├── a1b2....jpg
    └── c3d4....pdf
```

Never trust client filenames as filesystem paths.

Prevent:

* path traversal
* arbitrary overwrite
* executable uploads being executed
* excessive disk consumption

---

## 23. Image Handling

Do NOT OCR images by default.

Original images should be provided directly to multimodal providers when supported.

Each adapter must determine its provider's correct multimodal invocation method.

If a provider cannot consume an attachment, record:

```text
attachment_supported = false
```

for that provider/run.

Never imply that a model analyzed an attachment it did not receive.

Antigravity has no image input: shown a picture it reaches for Bash and writes a script to inspect
the pixels, which headless mode auto-denies — emptying the whole run. It is therefore never told
where binary attachments are, and its response is recorded with `attachment_supported = false`
rather than counted as a failure. Members that can read the attachment still receive it.

---

## 24. Rooms

Conversation sessions are called **Rooms**.

Example:

```text
Rooms

Today
├── Portfolio review
├── Server architecture
└── Laptop comparison

Yesterday
├── Travel planning
└── ETF comparison
```

Data model:

```text
Room
├── Messages
├── Attachments
└── Council Runs
```

Each room is addressable at `/r/<id>`; `/` is an empty draft and the room is only created when the
first message is sent.

### Concurrent deliberations

A council run is not a modal state on the app. Once a question is sent in one room, the reader
may open a different room, start a **New room**, or ask a follow-up somewhere else while the
first deliberation is still streaming in the background. The composer's **Ask** button is gated
per-room, not globally, so each room decides for itself whether another question can be sent yet.

Runs are tracked by their own id, not by the room currently on screen, so switching rooms does not
interrupt or lose a run. When the reader returns to a room whose run finished elsewhere, the
completed answer is already on the server and is fetched with the room's messages.

### Share links

A room may be published as a read-only page at `/s/<token>`.

```text
POST   /api/rooms/{id}/share     create (or return) the token
DELETE /api/rooms/{id}/share     revoke it
GET    /api/shared/{token}                          room title + messages
GET    /api/shared/{token}/attachments/{id}         one of that room's attachments
```

Rules:

* The token is the whole credential: `secrets.token_urlsafe(24)`, stored on the room, revocable.
* The shared endpoints require no CouncilRoom user and expose exactly one room — attachments are
  checked against that room, not just against the id.
* Shared pages are read-only: no composer, no retry, no per-member breakdown, no settings.
* Once a room is shared the link is displayed — in the room list and above the open room — not
  hidden behind a copy action.
* A share link does not bypass the deployment's own front door: behind a reverse proxy the proxy
  still decides who reaches the app at all.

---

## 25. Conversation Context

Follow-up questions should preserve Room context.

Each member keeps its own provider-side conversation per Room, resumed through the CLI's own
session flags:

```text
claude   --resume <session_id>
codex    exec resume <thread_id>
agy      --conversation <conversation_id>
```

Session ids come from each CLI's machine-readable output and are stored per Room + provider.

This keeps each member aware of its own earlier reasoning and of attachments from earlier turns,
and lets provider-side prompt caching apply.

CouncilRoom must not depend on that state being available. When no session exists, or when
resuming fails (expired or pruned sessions), CouncilRoom falls back to a conversation context it
constructs itself from the Room's messages and retries once.

Session reuse must be switchable:

```yaml
council:
  resume_sessions: true
```

Peer reviews and synthesis run in fresh sessions so review material never pollutes a member's
own thread.

Implement context-window management later if necessary.

---

## 26. Database

Use SQLite initially.

Tables:

```text
users
rooms             owner, title, share_token
messages
attachments
council_runs
agent_runs        one row per member per run, holding that member's response
peer_reviews
agent_sessions    provider-side session id per room + provider
```

A member's answer lives on its `agent_runs` row; there is no separate responses table.

No provider OAuth credentials belong in the database.

---

## 27. Council Run Model

Suggested fields:

```text
id
room_id
user_id
message_id
mode
status                pending | running | completed | failed
chairman_provider
answer                the synthesised Council Answer
error

created_at
started_at
completed_at
```

A run left `pending`/`running` by a restart is closed as `failed` at startup: nothing can still be
running in a process that has only just started.

---

## 28. Agent Run Model

Suggested fields:

```text
id
council_run_id
provider
model
role                  member | chairman

status
content               that member's own answer
attachment_supported

started_at
completed_at
duration_ms

exit_code
error
```

---

## 29. Streaming

CouncilRoom must provide live progress.

Prefer **Server-Sent Events (SSE)** initially.

Example:

```text
Council deliberating...

Claude        ✓  8.4s
Codex         ●  Thinking...
Antigravity   ✓  11.2s

Waiting for Codex...
```

Then:

```text
Synthesizing...

Chairman: Claude
```

Events:

```text
council.started

agent.started
agent.completed
agent.failed

peer_review.started
peer_review.completed

synthesis.started
synthesis.completed

council.completed
council.failed
```

---

## 30. Main UI

Mobile-first layout.

Example:

```text
┌────────────────────────────────┐
│ ☰  CouncilRoom        Quick ▼  │
├────────────────────────────────┤
│                                │
│ YOU                            │
│                                │
│ [image] [image]                │
│                                │
│ Analyze these and recommend    │
│ what I should do.              │
│                                │
│ COUNCIL                        │
│                                │
│ Claude        ✓                │
│ Codex         ✓                │
│ Antigravity   ✓                │
│                                │
│ ────────────────────────────── │
│ Council Answer                 │
│                                │
│ Final synthesized answer...    │
│                                │
│ ▸ Individual responses        │
│                                │
├────────────────────────────────┤
│ ＋  Ask Council...       Send  │
└────────────────────────────────┘
```

---

## 31. Individual Responses

The synthesized Council Answer is primary.

Raw answers should be expandable.

```text
Individual Responses

▸ Claude
▸ Codex
▸ Antigravity
```

Expanded:

```text
▼ Claude                       8.4s

Original independent response...
```

Deep mode may additionally expose:

```text
▸ Peer Reviews
```

---

## 32. Settings

Initial settings:

```text
Council
──────────────────────────────

Members

[x] Claude
[x] Codex
[x] Antigravity


Chairman

[ Claude ▼ ]


Default Mode

[ Quick Council ▼ ]


Provider Settings
──────────────────────────────

Claude
Model: [ Default ▼ ]

Codex
Model: [ Default ▼ ]

Antigravity
Model:  [ Default ▼ ]
Effort: [ High ▼ ]


Execution
──────────────────────────────

Timeout
[ 300 seconds ]

Minimum successful members
[ 2 ]
```

Where practical, discover available models from provider CLIs.

---

## 33. Authentication Philosophy

CouncilRoom should NOT become an identity provider.

Support simple application authentication plus reverse-proxy identity integration.

Initial modes:

```text
disabled
password
proxy
```

---

## 34. Disabled Authentication

For local development:

```yaml
auth:
  mode: disabled
```

Only recommended when CouncilRoom is bound to localhost or otherwise protected externally.

---

## 35. Password Authentication

Optional simple single-user mode:

```yaml
auth:
  mode: password
```

Suitable for basic private deployments.

Passwords must be securely hashed.

Never store plaintext passwords.

---

## 36. Reverse Proxy Authentication

CouncilRoom should support trusted authentication headers.

Example:

```yaml
auth:
  mode: proxy

  trusted_proxy:
    user_header: X-Authenticated-User
    allowed_ips: []       # peers permitted to set the header
    logout_url: null      # where the proxy ends its session
```

The actual header name must be configurable.

Behind a proxy the browser session belongs to the proxy, so signing out means sending the user to
`logout_url`. When it is empty the Sign out button is hidden rather than pretending to end a
session CouncilRoom does not own.

Each distinct identity string becomes its own CouncilRoom user, with its own rooms.

This allows CouncilRoom to work with external systems such as:

* Cloudflare Access
* Authentik
* Authelia
* oauth2-proxy
* other trusted reverse proxies

CouncilRoom must remain provider-neutral.

Do NOT hard-code Cloudflare-specific behavior into the core application.

---

## 37. Proxy Security

Never trust authentication headers from arbitrary clients.

When proxy auth mode is enabled:

* document that CouncilRoom must not be directly exposed — the header is trusted because of where
  it comes from, so anyone who can reach the app directly can claim any identity
* restrict which peers may set the header, through `trusted_proxy.allowed_ips`
* check the real peer address, never `X-Forwarded-For` — a client can send that too. Uvicorn's
  proxy-header handling is therefore left off
* keep the app bound to `127.0.0.1`, so an unreachable port and a peer check are what make the
  header safe

