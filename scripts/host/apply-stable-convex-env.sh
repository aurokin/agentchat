#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "$0")" && pwd)/lib.sh"
load_host_paths
ensure_stable_dirs
require_host_inputs
require_stable_checkout

runtime_env_path="$AGENTCHAT_STABLE_CONVEX_RUNTIME_ENV_PATH"
if [[ ! -f "$runtime_env_path" ]]; then
    echo "Missing stable Convex runtime env: $runtime_env_path" >&2
    exit 1
fi

if grep -Eq 'replace-me' "$runtime_env_path"; then
    echo "Stable Convex runtime env still contains placeholder values: $runtime_env_path" >&2
    exit 1
fi

deployment="$(RUNTIME_ENV_PATH="$runtime_env_path" python3 - <<'PY'
from pathlib import Path
path = Path(__import__('os').environ['RUNTIME_ENV_PATH'])
value = ''
for raw in path.read_text().splitlines():
    line = raw.strip()
    if line.startswith('CONVEX_DEPLOYMENT='):
        value = line.split('=', 1)[1].strip()
        break
print(value)
PY
)"

if [[ -z "$deployment" ]]; then
    echo "Missing CONVEX_DEPLOYMENT in $runtime_env_path" >&2
    exit 1
fi

target_env_file="$AGENTCHAT_STABLE_CHECKOUT_PATH/.env.convex.local"
backup_file=""
cleanup() {
    if [[ -n "$backup_file" && -f "$backup_file" ]]; then
        mv "$backup_file" "$target_env_file"
    else
        rm -f "$target_env_file"
    fi
}
cleanup_on_error() {
    local exit_code=$?
    if [[ "$exit_code" -ne 0 ]]; then
        cleanup
    fi
    return "$exit_code"
}
trap cleanup_on_error EXIT

if [[ -f "$target_env_file" ]]; then
    backup_file="$(mktemp)"
    cp "$target_env_file" "$backup_file"
fi

cp "$runtime_env_path" "$target_env_file"
(
    cd "$AGENTCHAT_STABLE_CHECKOUT_PATH"
    bun run convex:env -- --deployment "$deployment"
)
trap - EXIT

echo "Applied stable Convex runtime env to deployment $deployment"
