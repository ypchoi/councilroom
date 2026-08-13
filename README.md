# CouncilRoom

> One question. Multiple models. One considered answer.

CouncilRoom asks your question to several authenticated AI CLIs in parallel — Claude Code
(`claude`), OpenAI Codex (`codex`) and Google Antigravity (`agy`) — then has a Chairman model
synthesise their independent answers into one final answer.

It uses **your existing CLI subscriptions**. No Anthropic/OpenAI/Google API keys, and no OAuth
credentials are ever read, copied or stored by CouncilRoom.

---

## Requirements

* **Linux.** The app needs no more than a POSIX shell; the service scripts assume systemd.
* **Python 3.12+**, and **Node 22+** to build the frontend.
* **The provider CLIs, already signed in** — `claude`, `codex`, `agy`. CouncilRoom never logs them
  in for you and never sees how they are logged in. Two working members are enough to reach the
  default quorum, so a missing third is not a blocker.

## Install

CouncilRoom is not on PyPI yet. Once it is, one line will do it — the wheel carries the built
frontend:

```bash
pipx install councilroom       # not published yet; use the checkout below for now
```

Until then, install from a checkout:

```bash
git clone https://github.com/ypchoi/councilroom.git
cd councilroom
python3 -m venv .venv
.venv/bin/pip install -e ".[dev]"
cd frontend && npm install && npm run build   # bundles into backend/councilroom/static
```

Then:

```bash
.venv/bin/councilroom doctor   # check CLIs, auth and storage
.venv/bin/councilroom serve    # http://127.0.0.1:8420
```

`doctor` is the first thing to run and the first thing to check when a member stops answering: it
reports, per provider, whether the CLI is installed and whether it is authenticated, and never
displays credential contents.

---

## Modes

* **Quick Council** (default) — all members answer independently, the Chairman synthesises.
* **Deep Council** — adds an anonymised peer-review round before synthesis. Roughly double the
  calls, so noticeably more subscription quota.

If fewer than `minimum_successful_members` (default 2, clamped to the number of members actually
selected) succeed, synthesis is skipped and the provider errors are shown with a retry button. If
the Chairman fails you can retry, or promote a different provider to Chairman, without losing the
individual responses.

## Conversation context

Each member keeps its own provider-side session per room and resumes it on follow-ups
(`claude --resume`, `codex exec resume`, `agy --conversation`), so it remembers its earlier
reasoning and attachments, and provider-side caching applies. If no session exists yet, or resuming
fails because the session expired, CouncilRoom falls back to a transcript it rebuilds from the room
and retries once. Turn it off with `council.resume_sessions: false`.

Peer reviews and synthesis always run in fresh sessions, so review material never leaks into a
member's own thread.

## Attachments

Images (jpeg/png/webp), PDFs and plain text, up to 10 files and 25 MB each by default. The composer
offers Camera, Photos and Files as separate sources; files stay in the browser until you press Send,
which is when the room is created and the uploads happen. Attachments in a room are clickable —
images open inline, everything else downloads under its original name.

Text files are inlined into the prompt; images and PDFs are handed to providers that can read them.
Antigravity has no image input: shown a picture it reaches for Bash and writes a python/PIL script
to inspect the pixels, which headless mode auto-denies — leaving the whole run empty. So it is
never told where binary attachments are, and its response is marked `did not receive the
attachments` rather than failing. The other two members still see them.

## Rooms

Each room has its own URL, `/r/<id>`, so it can be bookmarked; `/` is an empty draft and a room is
only created when you send. The room list supports search, inline rename and delete-all. Ids are
`uuid4().hex`, and every room access is checked against its owner.

## Share links

The 🔗 button — in the room list and in the open room's header — publishes a room as a read-only
page at `/s/<token>` and copies the link. The link is then shown in both places rather than hidden
behind the button, and **Unshare** revokes it: the token stops working immediately, for everyone.

Anyone holding the link can read that room's messages and open its attachments without a
CouncilRoom account of their own — the token is the whole credential, so treat it like one. Shared
pages are read-only: no composer, no retry, no per-member breakdown, no settings.

A share link does not open a door through your front door. Behind Cloudflare Access (or any other
proxy) the recipient still has to satisfy the proxy to reach the site at all. To share outside your
Access policy, add a second self-hosted Access application with a **Bypass / Everyone** policy
covering three paths — the more specific application wins, so everything else stays protected:

| Path | Why |
|---|---|
| `/s` | the shared page |
| `/api/shared` | its messages and attachments |
| `/assets` | the JS/CSS bundle — without it the visitor gets a blank page |

`/icon.svg` and `/manifest.webmanifest` are optional; leaving them protected only costs the
favicon. The service worker is not registered on shared pages, since the app shell it caches is not
a page a visitor may fetch.

## Council panel

The drawer shows, per member: authentication state, the signed-in account, the model that will
answer (including what the CLI defaults to), and how many calls CouncilRoom has made.

Subscription quota (5h / 7d usage with reset times) is shown when the `claude-dashboard` plugin is
installed — CouncilRoom shells out to its `check-usage --json` rather than reading OAuth tokens
itself. Providers that report no quota say so instead of showing a fabricated number.

---

## Running as a service

```bash
scripts/install-service.sh     # registers a systemd --user unit and starts it
scripts/restart.sh             # restart (add --build to rebuild the frontend first)
scripts/restart.sh --build
journalctl --user -u councilroom -f
```

The unit sets `Restart=always`, so a crash is recovered in ~3s. It also bakes in the directories
where your provider CLIs actually live (`~/.local/bin`, nvm) — a systemd user service inherits
almost no `PATH`, and without this `codex` and `agy` would not be found.

**Surviving logout and reboot** needs lingering. The installer enables it for you when run from a
terminal (sudo may ask for your password); if it could not, it prints the one command to run:

```bash
sudo loginctl enable-linger $USER
```

Without it, the service stops when your last login session ends. Enabling it starts the user
manager at boot, so CouncilRoom comes up without anyone logging in. Verify with
`loginctl show-user $USER -p Linger`.

Host/port come from the environment at install time:

```bash
COUNCILROOM_HOST=127.0.0.1 COUNCILROOM_PORT=8420 scripts/install-service.sh
```

Docker is deliberately not used: the authenticated CLIs live on the host, and containerising would
mean reinstalling all three inside the image and mounting their credential directories in.

## Authentication

`~/.councilroom/config.yaml`:

```yaml
auth:
  mode: disabled          # disabled | password | proxy
  trusted_proxy:
    user_header: X-Authenticated-User
    allowed_ips: []       # restrict which peers may set the header
    logout_url: null      # where the proxy ends its session; empty hides Sign out
```

Behind a proxy the browser session belongs to the proxy, so the app's Sign out button sends the
user to `logout_url` — `/cdn-cgi/access/logout` for Cloudflare Access, `/oauth2/sign_out` for
oauth2-proxy, `/logout` for Authelia. Leave it empty and the button disappears rather than
pretending to sign anyone out.

* `disabled` — only safe on localhost or behind other protection.
* `password` — run `councilroom set-password` (stored as a pbkdf2-sha256 hash).
* `proxy` — identity comes from a trusted reverse proxy header (Cloudflare Access, Authentik,
  Authelia, oauth2-proxy, …). **CouncilRoom must not be exposed directly in this mode**; set
  `allowed_ips` to your proxy so arbitrary clients cannot forge the header.

The proxy check uses the real peer address, not `X-Forwarded-For`, so `councilroom serve` runs
uvicorn with proxy headers disabled.

### Header names by proxy

CouncilRoom only needs to know which header carries the identity and where that proxy ends its
session — nothing else is provider-specific.

| Proxy | `user_header` | `logout_url` |
|---|---|---|
| Cloudflare Access | `Cf-Access-Authenticated-User-Email` | `/cdn-cgi/access/logout` |
| oauth2-proxy | `X-Auth-Request-Email` | `/oauth2/sign_out` |
| Authelia | `Remote-User` (or `Remote-Email`) | `/logout` |
| Authentik | `X-authentik-email` | `/outpost.goauthentik.io/sign_out` |
| nginx `auth_request` | whatever you set | (leave empty) |

Whatever the proxy, set `allowed_ips` to its address and keep the app bound to `127.0.0.1`: the
header is trusted because of where it comes from, so an unreachable port and a peer check are what
make it safe. Each distinct identity string becomes its own CouncilRoom user with its own rooms.

### Example: Cloudflare Tunnel + Access

Publish without opening a port. Keep CouncilRoom on `127.0.0.1` and let the tunnel reach it.

1. Add a public hostname to a tunnel that already runs on this host (Zero Trust → Networks →
   Tunnels → your tunnel → Public Hostname): `councilroom.example.com` → `HTTP` →
   `127.0.0.1:8420`. If a DNS record with that name already exists, delete it first — the dashboard
   will not overwrite it.
2. Create the Access application **before** the hostname goes live (Zero Trust → Access →
   Applications → Self-hosted), with a policy that allows only your own identity. Without it the
   tunnel publishes the app to the internet with no authentication.
3. Point CouncilRoom at the header Access adds:

   ```yaml
   auth:
     mode: proxy
     trusted_proxy:
       user_header: Cf-Access-Authenticated-User-Email
       allowed_ips: ["127.0.0.1"]
       logout_url: /cdn-cgi/access/logout
   ```

4. `scripts/restart.sh`, then verify: a request without the header must return 401, and one with it
   must return 200.

Each distinct Access identity becomes a separate CouncilRoom user with its own rooms.

SSE survives Cloudflare: the stream sends a keepalive every 15s (under the 100s idle timeout) and
sets `X-Accel-Buffering: no`.

## Runtime files

Everything lives in one directory (override with `COUNCILROOM_HOME`):

```text
~/.councilroom/
├── councilroom.db   rooms, messages, runs, per-room provider session ids
├── config.yaml      auth, council members, chairman, timeouts, provider models
├── uploads/         attachments, uploads/<attachment_id>/<id>.<ext>
├── runs/
└── logs/
```

To back up, keep `councilroom.db` and `uploads/` (use
`sqlite3 councilroom.db "VACUUM INTO 'backup.db'"` while the service is running).

## Resetting state

```bash
scripts/reset.sh --db         # rooms, messages, runs, session ids
scripts/reset.sh --uploads    # stored attachments
scripts/reset.sh --auth       # CouncilRoom's own password + session secret
scripts/reset.sh --all --yes
```

Everything is copied to `~/.councilroom/backups/<timestamp>/` first, and the service is stopped and
restarted around the reset. **`--auth` does not sign out your CLIs** — `claude`, `codex` and `agy`
keep their OAuth in their own directories, which CouncilRoom never touches. Confirm with
`councilroom doctor` afterwards.

---

## Security

* **Provider credentials stay with the provider.** `claude`, `codex` and `agy` each keep their own
  OAuth in their own directory. CouncilRoom never reads, copies or stores any of it, and nothing
  under `~/.councilroom/` is a provider credential.
* `~/.councilroom/` is `0700` and `config.yaml` is `0600`.
* Uploads are stored non-executable under generated ids — client filenames are never used as paths.
* Every room access is checked against its owner; a share token is the whole credential for that
  one room and is revocable.
* Passwords are stored as pbkdf2-sha256 hashes, never in plaintext.
* Provider commands are executed as argv arrays, never through a shell.
* See [Authentication](#authentication) for what each auth mode does and does not protect —
  `disabled` and `proxy` both assume something in front of CouncilRoom.

## Development

```bash
pytest                                      # API + council engine, stubbed providers
cd frontend && npm run dev                  # Vite dev server, proxies /api to :8420
cd frontend && npm run build                # bundles into backend/councilroom/static
```

### Release

The wheel packages whatever `backend/councilroom/static/` holds at build time, so the bundle has to
be built first — otherwise the release installs a server with no UI:

```bash
cd frontend && npm run build
python -m build
twine upload dist/*
```

## License

MIT
