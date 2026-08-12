# CouncilRoom

> One question. Multiple models. One considered answer.

CouncilRoom asks your question to several authenticated AI CLIs in parallel — Claude Code
(`claude`), OpenAI Codex (`codex`) and Google Antigravity (`agy`) — then has a Chairman model
synthesise their independent answers into one final answer.

It uses **your existing CLI subscriptions**. No Anthropic/OpenAI/Google API keys, and no OAuth
credentials are ever read, copied or stored by CouncilRoom.

## Install

```bash
pipx install councilroom
councilroom doctor   # check CLIs, auth and storage
councilroom serve    # http://127.0.0.1:8420
```

## Runtime files

```text
~/.councilroom/
├── councilroom.db   # rooms, messages, runs
├── config.yaml
├── uploads/
├── runs/
└── logs/
```

## Modes

* **Quick Council** (default) — all members answer independently, the Chairman synthesises.
* **Deep Council** — adds an anonymised peer-review round before synthesis. Uses noticeably more
  subscription quota.

If fewer than `minimum_successful_members` (default 2) succeed, synthesis is skipped and the
provider errors are shown with a retry button. If the Chairman fails you can retry, or promote a
different provider to Chairman, without losing the individual responses.

## Attachments

Images (jpeg/png/webp), PDFs and plain text, up to 10 files and 25 MB each by default. Text files
are inlined into the prompt; images and PDFs are handed to providers that can read them. Antigravity
runs headless without a file-read permission, so binary attachments are marked
`did not receive the attachments` on its response instead of being silently dropped.

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

## Development

```bash
pip install -e ".[dev]"
pytest                          # API + council engine, with stubbed providers
cd frontend && npm install && npm run dev   # Vite dev server, proxies /api to :8420
cd frontend && npm run build                # bundles into backend/councilroom/static
```

## License

MIT
