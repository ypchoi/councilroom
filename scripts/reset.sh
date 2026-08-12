#!/usr/bin/env bash
# Reset CouncilRoom's own state. Everything removed is backed up first.
#
# This NEVER touches provider CLI credentials. `claude`, `codex` and `agy` keep
# their OAuth logins in their own directories (~/.claude, ~/.codex, ~/.gemini);
# CouncilRoom does not read or write those, so --auth here only resets
# CouncilRoom's app-level login, not your subscriptions.
set -euo pipefail

HOME_DIR="${COUNCILROOM_HOME:-$HOME/.councilroom}"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="$HOME_DIR/backups/$STAMP"

DB=false; UPLOADS=false; AUTH=false; ASSUME_YES=false

usage() {
  cat <<'EOF'
usage: reset.sh [--db] [--uploads] [--auth] [--all] [--yes]

  --db       delete rooms, messages, runs and provider session ids
  --uploads  delete stored attachment files
  --auth     clear CouncilRoom's password and rotate its session secret
             (signs browsers out; provider CLI logins are NOT affected)
  --all      all of the above
  --yes      skip the confirmation prompt

Everything is copied to ~/.councilroom/backups/<timestamp>/ before removal.
EOF
}

[ $# -eq 0 ] && { usage; exit 1; }
for arg in "$@"; do
  case "$arg" in
    --db) DB=true ;;
    --uploads) UPLOADS=true ;;
    --auth) AUTH=true ;;
    --all) DB=true; UPLOADS=true; AUTH=true ;;
    --yes|-y) ASSUME_YES=true ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown option: $arg" >&2; usage; exit 1 ;;
  esac
done

echo "CouncilRoom home: $HOME_DIR"
$DB      && echo "  - database        $HOME_DIR/councilroom.db"
$UPLOADS && echo "  - uploads         $HOME_DIR/uploads/"
$AUTH    && echo "  - app auth        password cleared, session secret rotated (CLI logins untouched)"
echo "  backup            $BACKUP"

if ! $ASSUME_YES; then
  read -r -p "proceed? [y/N] " reply
  [[ "$reply" =~ ^[Yy]$ ]] || { echo "aborted"; exit 1; }
fi

mkdir -p "$BACKUP"
RUNNING=false
if systemctl --user is-active --quiet councilroom 2>/dev/null; then
  RUNNING=true
  systemctl --user stop councilroom
elif pgrep -x councilroom >/dev/null 2>&1; then
  RUNNING=true
  pkill -x councilroom || true
  sleep 1
fi

if $DB && [ -f "$HOME_DIR/councilroom.db" ]; then
  cp "$HOME_DIR/councilroom.db" "$BACKUP/councilroom.db"
  rm -f "$HOME_DIR/councilroom.db" "$HOME_DIR/councilroom.db-wal" "$HOME_DIR/councilroom.db-shm"
  echo "database reset (recreated empty on next start)"
fi

if $UPLOADS && [ -d "$HOME_DIR/uploads" ]; then
  cp -r "$HOME_DIR/uploads" "$BACKUP/uploads"
  rm -rf "${HOME_DIR:?}/uploads"
  mkdir -p "$HOME_DIR/uploads"
  echo "uploads cleared"
fi

if $AUTH && [ -f "$HOME_DIR/config.yaml" ]; then
  cp "$HOME_DIR/config.yaml" "$BACKUP/config.yaml"
  COUNCILROOM_HOME="$HOME_DIR" "$REPO/.venv/bin/python" - <<'PY'
import os, pathlib, secrets, yaml

path = pathlib.Path(os.environ["COUNCILROOM_HOME"]) / "config.yaml"
config = yaml.safe_load(path.read_text()) or {}
auth = config.setdefault("auth", {})
auth["password_hash"] = None
auth["session_secret"] = secrets.token_urlsafe(32)
path.write_text(yaml.safe_dump(config, sort_keys=False))
print(f"app auth reset (mode stays '{auth.get('mode', 'disabled')}')")
PY
  echo "provider CLI logins were not touched — check with: councilroom doctor"
fi

if $RUNNING; then
  "$REPO/scripts/restart.sh"
fi

echo "backup kept at $BACKUP"
