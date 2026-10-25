#!/bin/sh
# Install the reviewed Beyondwords runtime once, then serve the web app.
set -eu

RUNTIME="${BEYONDWORDS_RUNTIME:-/runtime/venv}"

if [ ! -x "$RUNTIME/bin/python" ]; then
    echo "beyondwords: installing reviewed runtime into $RUNTIME"
    rm -rf "$RUNTIME.tmp"
    python3 /workspace/tools/setup_runtime.py --destination "$RUNTIME.tmp" --mcp
    rm -rf "$RUNTIME"
    mv "$RUNTIME.tmp" "$RUNTIME"
else
    echo "beyondwords: reusing runtime at $RUNTIME"
fi

mkdir -p "${BEYONDWORDS_WORKSPACE:-/data/workspace}"

echo "beyondwords: starting publishing workflow app on port ${PORT:-3000}"
exec python3 /workspace/webapp/server.py
