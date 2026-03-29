#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "$0")" && pwd)/lib.sh"
load_host_paths
ensure_stable_dirs
require_host_inputs
require_stable_checkout

if [[ -n "$(git -C "$AGENTCHAT_STABLE_CHECKOUT_PATH" status --porcelain)" ]]; then
    echo "Stable checkout has local changes; refusing to update it automatically." >&2
    exit 1
fi

previous_ref="$(git -C "$AGENTCHAT_STABLE_CHECKOUT_PATH" rev-parse HEAD)"
target_ref="${1:-$(git -C "$AGENTCHAT_REPO_ROOT" rev-parse HEAD)}"
was_running=0
if service_pid_running web || service_pid_running server; then
    was_running=1
fi

python3 - <<PYMETA
import json
from datetime import datetime, timezone
from pathlib import Path

path = Path(${AGENTCHAT_STABLE_RELEASE_STATE_PATH@Q})
path.parent.mkdir(parents=True, exist_ok=True)
path.write_text(json.dumps({
    "updatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    "previousRef": ${previous_ref@Q},
    "targetRef": ${target_ref@Q},
    "wasRunning": ${was_running},
}, indent=4) + "\n")
PYMETA

if [[ "$was_running" -eq 1 ]]; then
    "$AGENTCHAT_HOST_SCRIPT_DIR/stop-stable.sh"
fi

git -C "$AGENTCHAT_STABLE_CHECKOUT_PATH" fetch "$AGENTCHAT_REPO_ROOT" "$target_ref"
git -C "$AGENTCHAT_STABLE_CHECKOUT_PATH" checkout --detach FETCH_HEAD
render_and_register_stable_checkout
bun install --cwd "$AGENTCHAT_STABLE_CHECKOUT_PATH"
bun run --cwd "$AGENTCHAT_STABLE_CHECKOUT_PATH/apps/web" build

if ! "$AGENTCHAT_HOST_SCRIPT_DIR/doctor-stable.sh"; then
    echo "Stable update failed validation. Rolling back to $previous_ref." >&2
    git -C "$AGENTCHAT_STABLE_CHECKOUT_PATH" checkout --detach "$previous_ref"
    render_and_register_stable_checkout
    bun install --cwd "$AGENTCHAT_STABLE_CHECKOUT_PATH"
    bun run --cwd "$AGENTCHAT_STABLE_CHECKOUT_PATH/apps/web" build
    if [[ "$was_running" -eq 1 ]]; then
        "$AGENTCHAT_HOST_SCRIPT_DIR/start-stable.sh" || true
    fi
    exit 1
fi

if [[ "$was_running" -eq 1 ]]; then
    "$AGENTCHAT_HOST_SCRIPT_DIR/start-stable.sh"
fi

echo "Stable checkout updated to $(git -C "$AGENTCHAT_STABLE_CHECKOUT_PATH" rev-parse HEAD)."
