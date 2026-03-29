#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "$0")" && pwd)/lib.sh"
load_host_paths
ensure_stable_dirs
require_host_inputs
require_stable_checkout
render_and_register_stable_checkout
"$AGENTCHAT_HOST_SCRIPT_DIR/doctor-stable.sh"

ensure_port_available "$AGENTCHAT_STABLE_DEFAULT_HOST" "$AGENTCHAT_STABLE_SERVER_PORT" server
ensure_port_available "$AGENTCHAT_STABLE_DEFAULT_HOST" "$AGENTCHAT_STABLE_WEB_PORT" web

cleanup() {
    "$AGENTCHAT_HOST_SCRIPT_DIR/stop-stable.sh" >/dev/null 2>&1 || true
}
trap cleanup ERR

start_stable_service server bun run --cwd apps/server start
wait_for_port "$AGENTCHAT_STABLE_DEFAULT_HOST" "$AGENTCHAT_STABLE_SERVER_PORT" 30
start_stable_service web bun run --cwd apps/web start
wait_for_port "$AGENTCHAT_STABLE_DEFAULT_HOST" "$AGENTCHAT_STABLE_WEB_PORT" 30
trap - ERR

echo "Stable services started."
echo "Web URL: $AGENTCHAT_STABLE_WEB_URL"
echo "Server URL: $AGENTCHAT_STABLE_SERVER_URL"
echo "Logs:"
echo "- $(stable_logfile server)"
echo "- $(stable_logfile web)"
