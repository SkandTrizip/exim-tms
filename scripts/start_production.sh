#!/usr/bin/env bash
# Stop whatever is bound to 8000, then start the production Compose stack.
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$APP_DIR"

free_port_8000() {
  if command -v fuser >/dev/null 2>&1; then
    fuser -k 8000/tcp >/dev/null 2>&1 || true
  fi
  if command -v lsof >/dev/null 2>&1; then
    lsof -tiTCP:8000 -sTCP:LISTEN | xargs -r kill -9 >/dev/null 2>&1 || true
  fi
}

echo "Stopping previous Exim TMS instances..."

if command -v docker >/dev/null 2>&1; then
  if docker compose version >/dev/null 2>&1; then
    docker compose -f docker-compose.yml down --remove-orphans || true
  elif command -v docker-compose >/dev/null 2>&1; then
    docker-compose -f docker-compose.yml down --remove-orphans || true
  fi
  docker stop exim-tms-app exim-tms_app_1 >/dev/null 2>&1 || true
  docker rm -f exim-tms-app exim-tms_app_1 >/dev/null 2>&1 || true
fi

pkill -f "gunicorn.*backend.main:app" >/dev/null 2>&1 || true
pkill -f "uvicorn .*backend.main:app" >/dev/null 2>&1 || true
pkill -f "$APP_DIR/backend/main.py" >/dev/null 2>&1 || true
free_port_8000
sleep 2

echo "Starting Exim TMS with Docker Compose..."
if docker compose version >/dev/null 2>&1; then
  docker compose -f docker-compose.yml up -d --build --remove-orphans --force-recreate
elif command -v docker-compose >/dev/null 2>&1; then
  docker-compose -f docker-compose.yml up -d --build --remove-orphans --force-recreate
else
  echo "ERROR: Docker Compose is not installed." >&2
  exit 1
fi

echo "Deployed. Port 8000 should now be served by container exim-tms-app."
