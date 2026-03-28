#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "$0")" && pwd)/lib.sh"
load_host_paths
ensure_stable_dirs
ensure_host_input_files || true

stable_ref="$(git -C "$AGENTCHAT_REPO_ROOT" rev-parse HEAD)"

if [[ ! -d "$AGENTCHAT_STABLE_CHECKOUT_PATH/.git" ]]; then
    mkdir -p "$(dirname "$AGENTCHAT_STABLE_CHECKOUT_PATH")"
    if [[ -e "$AGENTCHAT_STABLE_CHECKOUT_PATH" && -n "$(ls -A "$AGENTCHAT_STABLE_CHECKOUT_PATH" 2>/dev/null || true)" ]]; then
        echo "Stable checkout path exists and is not an initialized git checkout: $AGENTCHAT_STABLE_CHECKOUT_PATH" >&2
        exit 1
    fi
    git clone "$AGENTCHAT_REPO_ROOT" "$AGENTCHAT_STABLE_CHECKOUT_PATH"
fi

if [[ -n "$(git -C "$AGENTCHAT_STABLE_CHECKOUT_PATH" status --porcelain)" ]]; then
    echo "Stable checkout has local changes; leaving its git state unchanged." >&2
else
    git -C "$AGENTCHAT_STABLE_CHECKOUT_PATH" fetch "$AGENTCHAT_REPO_ROOT" "$stable_ref"
    git -C "$AGENTCHAT_STABLE_CHECKOUT_PATH" checkout --detach FETCH_HEAD
fi

render_and_register_stable_checkout
bun install --cwd "$AGENTCHAT_STABLE_CHECKOUT_PATH"
bun run --cwd "$AGENTCHAT_STABLE_CHECKOUT_PATH/apps/web" build

echo "Stable install prepared."
echo "Checkout: $AGENTCHAT_STABLE_CHECKOUT_PATH"
echo "Web URL: $AGENTCHAT_STABLE_WEB_URL"
echo "Server URL: $AGENTCHAT_STABLE_SERVER_URL"
echo "Generated files:"
echo "- $AGENTCHAT_STABLE_CHECKOUT_PATH/apps/web/.env.local"
echo "- $AGENTCHAT_STABLE_CHECKOUT_PATH/apps/server/.env.local"
echo "- $AGENTCHAT_STABLE_CHECKOUT_PATH/apps/server/agentchat.config.json"
echo "- $AGENTCHAT_STABLE_CHECKOUT_PATH/packages/convex/.env.local"
echo "Next commands:"
echo "- scripts/host/doctor-stable.sh"
echo "- scripts/host/start-stable.sh"
