#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "$0")" && pwd)/lib.sh"
load_host_paths
ensure_stable_dirs
require_host_inputs
require_stable_checkout
render_and_register_stable_checkout

START_IF_NEEDED=0

for arg in "$@"; do
    case "$arg" in
        --start-if-needed)
            START_IF_NEEDED=1
            ;;
        *)
            echo "Unknown argument: $arg" >&2
            echo "Usage: scripts/host/smoke-stable.sh [--start-if-needed]" >&2
            exit 1
            ;;
    esac
done

if [[ "$START_IF_NEEDED" -eq 1 ]]; then
    if ! service_pid_running server || ! service_pid_running web; then
        "$AGENTCHAT_HOST_SCRIPT_DIR/start-stable.sh"
    fi
fi

if ! service_pid_running server; then
    echo "FAIL process: stable server is not running." >&2
    exit 1
fi

if ! service_pid_running web; then
    echo "FAIL process: stable web is not running." >&2
    exit 1
fi

"$AGENTCHAT_HOST_SCRIPT_DIR/doctor-stable.sh"

server_bind_host="$(stable_service_host server)"
web_bind_host="$(stable_service_host web)"
server_probe_host="$(stable_probe_host "$server_bind_host")"
web_probe_host="$(stable_probe_host "$web_bind_host")"
server_probe_url="http://${server_probe_host}:${AGENTCHAT_STABLE_SERVER_PORT}"
web_probe_url="http://${web_probe_host}:${AGENTCHAT_STABLE_WEB_PORT}"

server_health="$(curl -fsS "$server_probe_url/health")"
bootstrap_payload="$(curl -fsS "$server_probe_url/api/bootstrap")"
web_headers="$(mktemp)"
trap 'rm -f "$web_headers"' EXIT
curl -fsS -D "$web_headers" -o /dev/null "$web_probe_url/chat"

SITE_URL="$(
    CONVEX_RUNTIME_ENV_PATH="$AGENTCHAT_STABLE_CONVEX_RUNTIME_ENV_PATH" \
    HOST_HELPER_DIR="$AGENTCHAT_HOST_HELPER_DIR" \
    python3 - <<'PYENV'
import os
import sys

sys.path.append(os.environ["HOST_HELPER_DIR"])
from envfile import parse_env_file

print(parse_env_file(os.environ["CONVEX_RUNTIME_ENV_PATH"]).get("SITE_URL", ""))
PYENV
)"

SERVER_HEALTH="$server_health" BOOTSTRAP_PAYLOAD="$bootstrap_payload" python3 - <<'PYCHECK'
import json
import os

health = json.loads(os.environ["SERVER_HEALTH"])
if not health.get("ok"):
    raise SystemExit("FAIL health: /health did not report ok=true.")

bootstrap = json.loads(os.environ["BOOTSTRAP_PAYLOAD"])
providers = bootstrap.get("providers") or []
agents = bootstrap.get("agents") or []
auth = bootstrap.get("auth") or {}
if auth.get("requiresLogin") is not True:
    raise SystemExit("FAIL bootstrap: expected requiresLogin=true.")
if not providers:
    raise SystemExit("FAIL bootstrap: no enabled providers were returned.")
if not agents:
    raise SystemExit("FAIL bootstrap: no visible agents were returned.")
print(f"OK bootstrap: {len(providers)} providers, {len(agents)} agents.")
PYCHECK

if [[ -n "$SITE_URL" ]]; then
    curl -kfsS -o /dev/null -L "${SITE_URL%/}/chat"
    echo "OK site-url: $SITE_URL"
fi

echo "OK local-web: $web_probe_url/chat"
echo "OK local-server: $server_probe_url/health"
echo "Stable smoke passed."
