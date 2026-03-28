#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "$0")" && pwd)/lib.sh"
load_host_paths
ensure_stable_dirs
require_host_inputs
require_stable_checkout

if [[ ! -f "$AGENTCHAT_STABLE_RELEASE_STATE_PATH" ]]; then
    echo "No rollback metadata found at $AGENTCHAT_STABLE_RELEASE_STATE_PATH." >&2
    exit 1
fi

previous_ref="$(python3 - <<PYMETA
import json
from pathlib import Path
path = Path(${AGENTCHAT_STABLE_RELEASE_STATE_PATH@Q})
data = json.loads(path.read_text())
print(data.get("previousRef", ""))
PYMETA
)"
was_running="$(python3 - <<PYMETA
import json
from pathlib import Path
path = Path(${AGENTCHAT_STABLE_RELEASE_STATE_PATH@Q})
data = json.loads(path.read_text())
print("1" if data.get("wasRunning") else "0")
PYMETA
)"

if [[ -z "$previous_ref" ]]; then
    echo "Rollback metadata is missing previousRef." >&2
    exit 1
fi

if [[ -n "$(git -C "$AGENTCHAT_STABLE_CHECKOUT_PATH" status --porcelain)" ]]; then
    echo "Stable checkout has local changes; refusing to roll it back automatically." >&2
    exit 1
fi

if [[ "$was_running" -eq 1 ]] || service_pid_running web || service_pid_running server; then
    "$AGENTCHAT_HOST_SCRIPT_DIR/stop-stable.sh"
fi

git -C "$AGENTCHAT_STABLE_CHECKOUT_PATH" checkout --detach "$previous_ref"
render_and_register_stable_checkout
bun install --cwd "$AGENTCHAT_STABLE_CHECKOUT_PATH"
bun run --cwd "$AGENTCHAT_STABLE_CHECKOUT_PATH/apps/web" build

if [[ "$was_running" -eq 1 ]]; then
    "$AGENTCHAT_HOST_SCRIPT_DIR/start-stable.sh"
fi

echo "Stable checkout rolled back to $previous_ref."
