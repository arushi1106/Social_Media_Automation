#!/usr/bin/env bash
set -euo pipefail
echo "Start the API and UI in two terminals:"
echo "  make dev-api"
echo "  make dev-web"
echo
echo "Do not run python app.py — that legacy Flask route still publishes to Instagram."
