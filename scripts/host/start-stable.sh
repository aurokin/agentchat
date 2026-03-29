#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "$0")" && pwd)/lib.sh"
load_host_paths
ensure_stable_dirs
require_host_inputs
require_stable_checkout
render_and_register_stable_checkout
"$AGENTCHAT_HOST_SCRIPT_DIR/doctor-stable.sh"

server_host="$(stable_service_host server)"
web_host="$(stable_service_host web)"

server_running=0
web_running=0
started_server=0
started_web=0

if service_pid_running server; then
    server_running=1
else
    ensure_port_available "$server_host" "$AGENTCHAT_STABLE_SERVER_PORT" server
fi

if service_pid_running web; then
    web_running=1
else
    ensure_port_available "$web_host" "$AGENTCHAT_STABLE_WEB_PORT" web
fi

cleanup() {
    if [[ "$started_web" -eq 1 ]]; then
        stop_stable_service web >/dev/null 2>&1 || true
    fi
    if [[ "$started_server" -eq 1 ]]; then
        stop_stable_service server >/dev/null 2>&1 || true
    fi
}
trap cleanup ERR

if [[ "$server_running" -ne 1 ]]; then
    start_stable_service server bun run --cwd apps/server start
    started_server=1
    wait_for_port "$server_host" "$AGENTCHAT_STABLE_SERVER_PORT" 30
fi

if [[ "$web_running" -ne 1 ]]; then
    start_stable_service web bun run --cwd apps/web start
    started_web=1
    wait_for_port "$web_host" "$AGENTCHAT_STABLE_WEB_PORT" 30
fi
trap - ERR

echo "Stable services started."
echo "Web URL: $AGENTCHAT_STABLE_WEB_URL"
echo "Server URL: $AGENTCHAT_STABLE_SERVER_URL"
echo "Logs:"
echo "- $(stable_logfile server)"
echo "- $(stable_logfile web)"
