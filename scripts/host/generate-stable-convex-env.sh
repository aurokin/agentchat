#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "$0")" && pwd)/lib.sh"
load_host_paths
ensure_stable_dirs
ensure_host_input_files

runtime_env_path="$AGENTCHAT_STABLE_CONVEX_RUNTIME_ENV_PATH"
tmp_secrets="$(mktemp)"
trap 'rm -f "$tmp_secrets"' EXIT

(
    cd "$AGENTCHAT_REPO_ROOT"
    bun run convex:gen-secrets > "$tmp_secrets"
)

RUNTIME_ENV_PATH="$runtime_env_path" \
SERVER_ENV_PATH="$AGENTCHAT_STABLE_SERVER_ENV_PATH" \
WEB_ENV_PATH="$AGENTCHAT_STABLE_WEB_ENV_PATH" \
CONVEX_ENV_PATH="$AGENTCHAT_STABLE_CONVEX_ENV_PATH" \
GENERATED_SECRETS_PATH="$tmp_secrets" \
DEFAULT_SITE_URL="$AGENTCHAT_STABLE_WEB_URL" \
python3 - <<'PY'
import secrets
from pathlib import Path
import os

PLACEHOLDERS = {"", "replace-me", "https://replace-me.convex.site", "https://replace-me.convex.cloud", "prod:replace-me"}

def parse_env(path_str: str) -> dict[str, str]:
    path = Path(path_str)
    data: dict[str, str] = {}
    if not path.exists():
        return data
    for raw in path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, value = line.split('=', 1)
        data[key.strip()] = value.strip()
    return data

def write_env(path_str: str, values: dict[str, str], heading: str) -> None:
    path = Path(path_str)
    path.parent.mkdir(parents=True, exist_ok=True)
    lines = [heading, ""]
    for key in sorted(values):
        value = values[key]
        if value:
            lines.append(f"{key}={value}")
    path.write_text("\n".join(lines) + "\n")

def is_missing(value: str | None) -> bool:
    return value is None or value.strip() in PLACEHOLDERS

runtime_env = parse_env(os.environ["RUNTIME_ENV_PATH"])
server_env = parse_env(os.environ["SERVER_ENV_PATH"])
web_env = parse_env(os.environ["WEB_ENV_PATH"])
convex_env = parse_env(os.environ["CONVEX_ENV_PATH"])
generated = parse_env(os.environ["GENERATED_SECRETS_PATH"])

convex_deployment = convex_env.get("CONVEX_DEPLOYMENT", "prod:replace-me")
convex_url = convex_env.get("CONVEX_URL", "https://replace-me.convex.cloud")
convex_site_url = convex_url.replace(".cloud", ".site") if convex_url.startswith("https://") else server_env.get("AGENTCHAT_CONVEX_SITE_URL", "https://replace-me.convex.site")

runtime_env["CONVEX_DEPLOYMENT"] = convex_deployment
if is_missing(runtime_env.get("SITE_URL")):
    runtime_env["SITE_URL"] = os.environ["DEFAULT_SITE_URL"]

for key in ("JWKS", "JWT_PRIVATE_KEY", "ENCRYPTION_KEY"):
    if is_missing(runtime_env.get(key)):
        runtime_env[key] = generated[key]

if is_missing(runtime_env.get("BACKEND_TOKEN_SECRET")):
    existing_server_secret = server_env.get("BACKEND_TOKEN_SECRET")
    runtime_env["BACKEND_TOKEN_SECRET"] = existing_server_secret if not is_missing(existing_server_secret) else secrets.token_urlsafe(32)
if is_missing(runtime_env.get("RUNTIME_INGRESS_SECRET")):
    existing_ingress_secret = server_env.get("RUNTIME_INGRESS_SECRET")
    runtime_env["RUNTIME_INGRESS_SECRET"] = existing_ingress_secret if not is_missing(existing_ingress_secret) else secrets.token_urlsafe(32)

server_env["BACKEND_TOKEN_SECRET"] = runtime_env["BACKEND_TOKEN_SECRET"]
server_env["RUNTIME_INGRESS_SECRET"] = runtime_env["RUNTIME_INGRESS_SECRET"]
server_env["AGENTCHAT_CONVEX_SITE_URL"] = convex_site_url
web_env["NEXT_PUBLIC_CONVEX_URL"] = convex_url

write_env(
    os.environ["RUNTIME_ENV_PATH"],
    runtime_env,
    "# Host-managed Convex runtime env for the stable Agentchat install",
)
write_env(
    os.environ["SERVER_ENV_PATH"],
    server_env,
    "# Host-managed server env for the stable Agentchat install",
)
write_env(
    os.environ["WEB_ENV_PATH"],
    web_env,
    "# Host-managed web env for the stable Agentchat install",
)
PY

echo "Stable Convex runtime env updated: $runtime_env_path"
echo "Stable server/web env files synced with generated shared secrets."
