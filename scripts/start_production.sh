#!/bin/bash
# Start Exim TMS (Uvicorn, no reloader) detached from the current shell.
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/exim_logipod/exim-tms}"
PYTHON="${PYTHON:-$HOME/venv/bin/python}"
UPLOAD_DIR="${UPLOAD_DIR:-$HOME/uploads}"
PID_FILE="$APP_DIR/logs/app.pid"

detect_nginx_port() {
  local port=""
  local files
  files="$(ls /etc/nginx/sites-enabled/* /etc/nginx/conf.d/*.conf 2>/dev/null || true)"
  if [ -n "$files" ]; then
    port="$(grep -hR --include='*' 'proxy_pass' $files 2>/dev/null \
      | grep -oE '127\.0\.0\.1:[0-9]+' \
      | head -1 \
      | cut -d: -f2 || true)"
  fi
  echo "$port"
}

if [ -z "${APP_PORT:-}" ]; then
  APP_PORT="$(detect_nginx_port)"
fi
APP_PORT="${APP_PORT:-8000}"

if [ ! -x "$PYTHON" ]; then
  echo "ERROR: Python not found at $PYTHON" >&2
  exit 1
fi

mkdir -p "$APP_DIR/logs"

if [ -f "$PID_FILE" ]; then
  OLD_PID="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [[ "${OLD_PID:-}" =~ ^[0-9]+$ ]] && kill -0 "$OLD_PID" 2>/dev/null; then
    if [ -r "/proc/$OLD_PID/cmdline" ] && tr '\0' ' ' < "/proc/$OLD_PID/cmdline" | grep -q "$APP_DIR"; then
      kill "$OLD_PID" 2>/dev/null || true
      sleep 1
      kill -KILL "$OLD_PID" 2>/dev/null || true
    fi
  fi
  rm -f "$PID_FILE"
fi

cd "$APP_DIR"
export UPLOAD_DIR

setsid "$PYTHON" -m uvicorn backend.main:app \
  --host 0.0.0.0 \
  --port "$APP_PORT" \
  --no-access-log \
  >> "$APP_DIR/logs/app.out" 2>&1 < /dev/null &

APP_PID=$!
echo "$APP_PID" > "$PID_FILE"
disown "$APP_PID" 2>/dev/null || true
sleep 2

if ! kill -0 "$APP_PID" 2>/dev/null; then
  echo "ERROR: failed to start" >&2
  tail -n 40 "$APP_DIR/logs/app.out" || true
  exit 1
fi

echo "Started pid=$APP_PID on port $APP_PORT"
curl -sS --max-time 5 "http://127.0.0.1:${APP_PORT}/api" || true
echo
