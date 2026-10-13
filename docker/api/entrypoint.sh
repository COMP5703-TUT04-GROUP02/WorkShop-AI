#!/bin/sh
set -eu

python scripts/generate_jwt_keys.py

role="${1:-api}"

case "$role" in
  api)
    # Apply versioned schema and fixed sample-data migrations.
    alembic upgrade head
    exec uvicorn backend.main:app --host 0.0.0.0 --port 8000
    ;;
  worker)
    exec celery -A backend.tasks.celery_app worker --loglevel=info
    ;;
  *)
    exec "$@"
    ;;
esac
