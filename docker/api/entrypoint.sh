#!/bin/sh
set -eu

python scripts/generate_jwt_keys.py

role="${1:-api}"

case "$role" in
  api)
    alembic upgrade head
    python -m backend.seed_locations
    if [ "${WORKSHOP_SEED:-0}" = "1" ]; then
      python -m backend.seed_demo_data
    fi
    exec uvicorn backend.main:app --host 0.0.0.0 --port 8000
    ;;
  worker)
    exec celery -A backend.tasks.celery_app worker --loglevel=info
    ;;
  *)
    exec "$@"
    ;;
esac
