#!/bin/sh
set -eu

export PATH="/usr/local/bin:/usr/bin:/bin:${PATH:-}"
export PYTHONPATH="${PYTHONPATH:-/app}"
export PYTHONUNBUFFERED=1
export UPLOAD_DIR="${UPLOAD_DIR:-/app/uploads}"

echo "entrypoint: uid=$(id -u) cwd=$(pwd) UPLOAD_DIR=$UPLOAD_DIR"
mkdir -p /app/logs /app/uploads

echo "entrypoint: preflight import backend.main"
if ! python -c "import backend.main"; then
  echo "entrypoint: backend.main failed to import" >&2
  exit 1
fi

echo "entrypoint: starting gunicorn on 0.0.0.0:8000"
exec gunicorn \
  -w "${WEB_CONCURRENCY:-2}" \
  -k uvicorn.workers.UvicornWorker \
  backend.main:app \
  --bind 0.0.0.0:8000 \
  --timeout 120 \
  --access-logfile - \
  --error-logfile -
