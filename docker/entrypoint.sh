#!/bin/sh
set -eu

mkdir -p /app/logs /app/uploads
# Host bind-mounts and named volumes are often root-owned; gunicorn runs as appuser.
chown -R appuser:appuser /app/logs /app/uploads 2>/dev/null || true

exec su -s /bin/sh appuser -c \
  "gunicorn -w ${WEB_CONCURRENCY:-2} -k uvicorn.workers.UvicornWorker backend.main:app --bind 0.0.0.0:8000 --timeout 120 --access-logfile - --error-logfile -"
