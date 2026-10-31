#!/usr/bin/env bash
# ShadowGuard AI - one-command demo launcher (macOS / Linux).
#
#   ./start_demo.sh            # collector on
#   ./start_demo.sh --no-collector
#   ./start_demo.sh --no-relay      # flags can be combined
#
# Frees ports 8000/5173/11435, regenerates demo data with recent timestamps, resets the
# database, starts the backend and the frontend in their own terminal windows
# (falls back to background processes with logs if no terminal can be opened),
# loads scenarios 01-04, 06 and 07, starts the Local LLM Guard relay (llm_relay.py),
# and restores demo_data/ so the repo stays clean.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"
API_URL="http://127.0.0.1:8000"
APP_URL="http://127.0.0.1:5173"
RELAY_PORT=11435
COLLECTOR_ENV=""
RELAY=1
for arg in "$@"; do
  case "$arg" in
    --no-collector) COLLECTOR_ENV="COLLECTOR_ENABLED=0 " ;;
    --no-relay) RELAY=0 ;;
  esac
done

step() { printf '\n==> %s\n' "$1"; }

stop_port() {
  local pids
  pids="$(lsof -ti "tcp:$1" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -z "$pids" ]]; then echo "    port $1 is free"; return; fi
  for pid in $pids; do
    kill -9 "$pid" 2>/dev/null && echo "    stopped PID $pid on port $1"
  done
}

wait_url() {
  local url="$1" deadline=$((SECONDS + $2))
  while (( SECONDS < deadline )); do
    curl -fs -o /dev/null "$url" && return 0
    sleep 0.5
  done
  return 1
}

# Run a command in a new terminal window; fall back to a logged background process.
in_new_window() {
  local title="$1" cmd="$2"
  if [[ "$(uname)" == "Darwin" ]]; then
    osascript -e "tell application \"Terminal\" to do script \"$cmd\"" >/dev/null
  elif command -v gnome-terminal >/dev/null; then
    gnome-terminal --title="$title" -- bash -c "$cmd; exec bash"
  elif command -v x-terminal-emulator >/dev/null; then
    x-terminal-emulator -e bash -c "$cmd; exec bash" &
  else
    local log="/tmp/shadowguard-${title// /-}.log"
    nohup bash -c "$cmd" >"$log" 2>&1 &
    echo "    no terminal found; running in background, log: $log"
  fi
}

# Use backend/venv only if it has every backend dependency; otherwise python3.
PYTHON="python3"
if [[ -x "$BACKEND/venv/bin/python" ]] &&
   "$BACKEND/venv/bin/python" -c "import fastapi, uvicorn, psutil, openai, requests" 2>/dev/null; then
  PYTHON="$BACKEND/venv/bin/python"
fi

step "Freeing ports 8000, 5173 and $RELAY_PORT"
stop_port 8000
stop_port 5173
stop_port "$RELAY_PORT"
sleep 1

step "Regenerating demo data and resetting the database (python: $PYTHON)"
(cd "$BACKEND" && "$PYTHON" demo_reset.py --fresh)

step "Starting the backend in its own window"
in_new_window "ShadowGuard backend" "cd '$BACKEND' && ${COLLECTOR_ENV}'$PYTHON' main.py"
wait_url "$API_URL/api/health" 60 || { echo "Backend did not answer on $API_URL within 60 s"; exit 1; }
echo "    backend is up"

step "Loading demo scenarios 01 02 03 04 06 07"
FILES=()
for n in 01 02 03 04 06 07; do FILES+=("$ROOT"/demo_data/"${n}"_*.jsonl); done
(cd "$BACKEND" && "$PYTHON" load_demo.py "${FILES[@]}")

if (( RELAY )); then
  step "Starting the Local LLM Guard relay in its own window"
  in_new_window "ShadowGuard relay" "cd '$BACKEND' && '$PYTHON' llm_relay.py"
fi

step "Restoring demo_data/ (regenerated files are not committed)"
(cd "$ROOT" && git checkout -- demo_data 2>/dev/null) || echo "    (git not available; demo_data left as generated)"

step "Starting the frontend in its own window"
[[ -d "$FRONTEND/node_modules" ]] || (cd "$FRONTEND" && npm install)
in_new_window "ShadowGuard frontend" "cd '$FRONTEND' && npm run dev"
wait_url "$APP_URL" 60 || { echo "Frontend did not answer on $APP_URL within 60 s"; exit 1; }

ANALYZER="$(curl -fs "$API_URL/api/health" | "$PYTHON" -c 'import json,sys; print(json.load(sys.stdin)["analyzer"])')"
step "Ready"
echo "    Dashboard : $APP_URL"
echo "    API       : $API_URL  (docs: $API_URL/docs)"
echo "    Analyzer  : $ANALYZER"
echo "    Collector : $([[ -n "$COLLECTOR_ENV" ]] && echo off || echo on)"
if (( RELAY )); then
  echo "    LLM relay : http://127.0.0.1:$RELAY_PORT  (opt in: export OLLAMA_HOST=127.0.0.1:$RELAY_PORT)"
else
  echo "    LLM relay : off"
fi
echo
echo "    Live demo : cd backend && $PYTHON demo_agent.py"
(( RELAY )) && echo "    Relay demo: cd backend && $PYTHON relay_demo.py"
echo "    Stop all  : lsof -ti tcp:8000,5173,$RELAY_PORT -sTCP:LISTEN | xargs kill"
