#!/usr/bin/env bash
# Restart CouncilRoom. With --build, rebuild the frontend bundle first.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${COUNCILROOM_PORT:-8420}"

if [ "${1:-}" = "--build" ]; then
  echo "building frontend…"
  (cd "$REPO/frontend" && npm run build)
fi

if systemctl --user list-unit-files councilroom.service >/dev/null 2>&1 &&
   [ -f "$HOME/.config/systemd/user/councilroom.service" ]; then
  systemctl --user restart councilroom
  systemctl --user --no-pager status councilroom | head -6
else
  # Not installed as a service: fall back to a plain background process.
  pkill -x councilroom 2>/dev/null || true
  sleep 1
  mkdir -p "$HOME/.councilroom/logs"
  nohup "$REPO/.venv/bin/councilroom" serve --port "$PORT" \
    >> "$HOME/.councilroom/logs/serve.log" 2>&1 &
  echo "started in the background (no systemd unit; see scripts/install-service.sh)"
fi

for _ in $(seq 30); do
  if curl -sf -o /dev/null "http://127.0.0.1:$PORT/api/auth/me"; then
    echo "ready on http://127.0.0.1:$PORT"
    exit 0
  fi
  sleep 1
done

echo "did not come up within 30s — check: journalctl --user -u councilroom -n 50" >&2
exit 1
