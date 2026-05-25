#!/bin/bash
# Start SpotyTangoDisplay relay and open control panel

if ! command -v node &>/dev/null; then
  echo "Node.js not found. Install it from https://nodejs.org"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "Starting SpotyTangoDisplay..."
node relay.js &
RELAY_PID=$!

sleep 1
open "http://127.0.0.1:3456"

echo "Running (PID $RELAY_PID). Press Ctrl+C to stop."
wait $RELAY_PID
