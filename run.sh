#!/usr/bin/env bash
# Start air-quality-api (NestJS :3002)
# Usage: bash run.sh [--no-install] [--no-migrate]
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

SKIP_INSTALL=false
SKIP_MIGRATE=false
for arg in "$@"; do
  case "$arg" in
    --no-install) SKIP_INSTALL=true ;;
    --no-migrate) SKIP_MIGRATE=true ;;
  esac
done

if [ ! -f .env ]; then
  echo "⚠️  .env chưa có — copy từ .env.example"
  cp .env.example .env
fi

if [ "$SKIP_INSTALL" = false ]; then
  echo ">>> yarn install..."
  yarn install
fi

if [ "$SKIP_MIGRATE" = false ]; then
  echo ">>> yarn migration:up..."
  yarn migration:up
fi

echo ">>> Starting NestJS on :3002..."
exec yarn start:dev
