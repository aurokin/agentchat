#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "$0")" && pwd)/lib.sh"
load_host_paths
ensure_stable_dirs
require_host_inputs
require_stable_checkout
render_and_register_stable_checkout

checks_ok=1

if grep -Eq 'replace-me|example\.convex\.site|replace-me\.convex\.cloud' "$AGENTCHAT_STABLE_WEB_ENV_PATH" "$AGENTCHAT_STABLE_SERVER_ENV_PATH" "$AGENTCHAT_STABLE_CONVEX_ENV_PATH"; then
    echo "FAIL host-config: stable host env files still contain placeholder values." >&2
    checks_ok=0
else
    echo "OK host-config: stable host env files are present."
fi

if [[ ! -f "$AGENTCHAT_STABLE_CHECKOUT_PATH/apps/web/.next/BUILD_ID" ]]; then
    echo "FAIL web-build: missing built web output. Run scripts/host/install-stable.sh." >&2
    checks_ok=0
else
    echo "OK web-build: $AGENTCHAT_STABLE_CHECKOUT_PATH/apps/web/.next/BUILD_ID"
fi

if ! bun run --cwd "$AGENTCHAT_STABLE_CHECKOUT_PATH/apps/server" doctor; then
    checks_ok=0
fi

if [[ "$checks_ok" -ne 1 ]]; then
    exit 1
fi
