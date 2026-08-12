# CouncilRoom

> One question. Multiple models. One considered answer.

CouncilRoom asks your question to several authenticated AI CLIs in parallel — Claude Code
(`claude`), OpenAI Codex (`codex`) and Google Antigravity (`agy`) — then has a Chairman model
synthesise their independent answers into one final answer.

It uses **your existing CLI subscriptions**. No Anthropic/OpenAI/Google API keys, and no OAuth
credentials are ever read, copied or stored by CouncilRoom.

---

## Install

```bash
pipx install councilroom
councilroom doctor   # check CLIs, auth and storage
councilroom serve    # http://127.0.0.1:8420
```

From a checkout:

```bash
python3 -m venv .venv
.venv/bin/pip install -e ".[dev]"
cd frontend && npm install && npm run build   # bundles into backend/councilroom/static
```

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

The directory is `0700`, `config.yaml` is `0600`, uploads are stored non-executable under generated
ids — client filenames are never used as paths. To back up, keep `councilroom.db` and `uploads/`
(use `sqlite3 councilroom.db "VACUUM INTO 'backup.db'"` while the service is running).

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

**Surviving logout and reboot** needs lingering, which the installer cannot enable for you:

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
Antigravity runs headless without a file-read permission, so binary attachments are marked
`did not receive the attachments` on its response instead of being silently dropped.

## Rooms

Each room has its own URL, `/r/<id>`, so it can be bookmarked and shared; `/` is an empty draft and
a room is only created when you send. The room list supports search, inline rename and delete-all.
Ids are `uuid4().hex`, and every room access is checked against its owner.

## Council panel

The drawer shows, per member: authentication state, the signed-in account, the model that will
answer (including what the CLI defaults to), and how many calls CouncilRoom has made.

Subscription quota (5h / 7d usage with reset times) is shown when the
[claude-dashboard](https://github.com/anthropics/claude-code) plugin is installed — CouncilRoom
shells out to its `check-usage --json` rather than reading OAuth tokens itself. Providers that
report no quota say so instead of showing a fabricated number.

---

## Authentication

`~/.councilroom/config.yaml`:

```yaml
auth:
  mode: disabled          # disabled | password | proxy
  trusted_proxy:
    user_header: X-Authenticated-User
    allowed_ips: []       # restrict which peers may set the header
```

* `disabled` — only safe on localhost or behind other protection.
* `password` — run `councilroom set-password` (stored as a pbkdf2-sha256 hash).
* `proxy` — identity comes from a trusted reverse proxy header (Cloudflare Access, Authentik,
  Authelia, oauth2-proxy, …). **CouncilRoom must not be exposed directly in this mode**; set
  `allowed_ips` to your proxy so arbitrary clients cannot forge the header.

The proxy check uses the real peer address, not `X-Forwarded-For`, so `councilroom serve` runs
uvicorn with proxy headers disabled.

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
   ```

4. `scripts/restart.sh`, then verify: a request without the header must return 401, and one with it
   must return 200.

Each distinct Access identity becomes a separate CouncilRoom user with its own rooms.

SSE survives Cloudflare: the stream sends a keepalive every 15s (under the 100s idle timeout) and
sets `X-Accel-Buffering: no`.

---

## Development

```bash
pytest                                      # API + council engine, stubbed providers
cd frontend && npm run dev                  # Vite dev server, proxies /api to :8420
cd frontend && npm run build                # bundles into backend/councilroom/static
```

## License

MIT
