#!/usr/bin/env bash
# Register CouncilRoom as a systemd --user service: starts at boot, restarts on crash.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN="$REPO/.venv/bin/councilroom"
UNIT="$HOME/.config/systemd/user/councilroom.service"
HOST="${COUNCILROOM_HOST:-127.0.0.1}"
PORT="${COUNCILROOM_PORT:-8420}"

[ -x "$BIN" ] || { echo "councilroom is not installed at $BIN — run: python3 -m venv .venv && .venv/bin/pip install -e ." >&2; exit 1; }

# A user unit inherits almost no PATH, but the provider CLIs live in per-user
# directories (~/.local/bin, nvm). Bake in wherever they actually are right now.
CLI_PATH=""
for cli in claude codex agy; do
  location="$(command -v "$cli" 2>/dev/null || true)"
  [ -n "$location" ] && CLI_PATH="$CLI_PATH$(dirname "$location"):"
done
UNIT_PATH="${CLI_PATH}$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin"

mkdir -p "$(dirname "$UNIT")"
cat > "$UNIT" <<EOF
[Unit]
Description=CouncilRoom — one question, multiple models, one answer
After=network-online.target

[Service]
Type=simple
WorkingDirectory=$HOME
Environment=PATH=$UNIT_PATH
ExecStart=$BIN serve --host $HOST --port $PORT
Restart=always
RestartSec=3

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload
systemctl --user enable --now councilroom

# Without lingering, user services stop when the last login session ends.
if [ "$(loginctl show-user "$USER" -p Linger --value)" != "yes" ]; then
  echo
  if sudo -n true 2>/dev/null; then
    sudo loginctl enable-linger "$USER"
  elif [ -t 0 ] && command -v sudo >/dev/null; then
    echo "Enabling linger so the service survives logout and reboot — sudo may ask for your password."
    sudo loginctl enable-linger "$USER" || true
  fi

  if [ "$(loginctl show-user "$USER" -p Linger --value)" = "yes" ]; then
    echo "linger enabled: the service now starts at boot."
  else
    # Non-interactive shell, or sudo declined: leave the one command to run.
    echo "NOTE: linger is off, so this service stops when your last login session ends."
    echo "      To keep it running across logout and reboot, run:"
    echo "        sudo loginctl enable-linger $USER"
  fi
fi

echo
systemctl --user --no-pager status councilroom | head -12
echo
echo "unit:    $UNIT"
echo "logs:    journalctl --user -u councilroom -f"
echo "restart: scripts/restart.sh"
