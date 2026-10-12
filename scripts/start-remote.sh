#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
. ./.local/remote.env
exec .venv/bin/python -m uvicorn server.app:app --host 127.0.0.1 --port 8000 --no-proxy-headers
