#!/usr/bin/env bash
set -euo pipefail

AGENTCHAT_HOST_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AGENTCHAT_REPO_ROOT="$(cd "${AGENTCHAT_HOST_SCRIPT_DIR}/../.." && pwd)"
AGENTCHAT_HOST_CONFIG_PATH="${HOME}/.config/agentchat/config.json"
AGENTCHAT_STABLE_STATE_ROOT="${HOME}/.local/state/agentchat/stable"
AGENTCHAT_STABLE_LOG_DIR="${AGENTCHAT_STABLE_STATE_ROOT}/logs"
AGENTCHAT_STABLE_PID_DIR="${AGENTCHAT_STABLE_STATE_ROOT}/pids"
AGENTCHAT_STABLE_XDG_STATE_HOME="${AGENTCHAT_STABLE_STATE_ROOT}/xdg"
AGENTCHAT_STABLE_SANDBOX_ROOT="${AGENTCHAT_STABLE_STATE_ROOT}/sandboxes"
AGENTCHAT_STABLE_STATE_ID="stable-install"
AGENTCHAT_STABLE_RELEASE_STATE_PATH="${AGENTCHAT_STABLE_STATE_ROOT}/release.json"
AGENTCHAT_HOST_REGISTRY_ROOT="${HOME}/.local/state/agentchat/local-host"
AGENTCHAT_HOST_REGISTRY_PATH="${AGENTCHAT_HOST_REGISTRY_ROOT}/registry.json"
AGENTCHAT_HOST_PORT_LEASES_PATH="${AGENTCHAT_HOST_REGISTRY_ROOT}/port-leases.json"
AGENTCHAT_DEFAULT_STABLE_CHECKOUT_PATH="/home/auro/code/agentchat/stable"
AGENTCHAT_DEFAULT_STABLE_WEB_ENV_PATH="${HOME}/.config/agentchat/stable/web.env"
AGENTCHAT_DEFAULT_STABLE_SERVER_ENV_PATH="${HOME}/.config/agentchat/stable/server.env"
AGENTCHAT_DEFAULT_STABLE_CONVEX_ENV_PATH="${HOME}/.config/agentchat/stable/convex.env"
AGENTCHAT_DEFAULT_STABLE_SERVER_CONFIG_PATH="${HOME}/.config/agentchat/stable/server-config.json"
AGENTCHAT_DEFAULT_STABLE_CONVEX_RUNTIME_ENV_PATH="${HOME}/.config/agentchat/stable/convex-runtime.env"
AGENTCHAT_STABLE_WEB_PORT=4040
AGENTCHAT_STABLE_SERVER_PORT=3030
AGENTCHAT_STABLE_WEB_URL="http://localhost:${AGENTCHAT_STABLE_WEB_PORT}"
AGENTCHAT_STABLE_SERVER_URL="http://localhost:${AGENTCHAT_STABLE_SERVER_PORT}"

host_config_value() {
    local key="$1"
    local default_value="$2"
    KEY="$key" DEFAULT_VALUE="$default_value" CONFIG_PATH="$AGENTCHAT_HOST_CONFIG_PATH" python3 - <<'PYCONF'
import json
import os
from pathlib import Path

config_path = Path(os.environ["CONFIG_PATH"])
value = None
if config_path.exists():
    try:
        value = json.loads(config_path.read_text())
    except Exception:
        value = None
for segment in os.environ["KEY"].split('.'):
    if value is None or not isinstance(value, dict):
        value = None
        break
    value = value.get(segment)
if value in (None, ""):
    print(os.environ["DEFAULT_VALUE"])
else:
    print(value)
PYCONF
}

load_host_paths() {
    AGENTCHAT_STABLE_CHECKOUT_PATH="$(host_config_value stableCheckoutPath "$AGENTCHAT_DEFAULT_STABLE_CHECKOUT_PATH")"
    AGENTCHAT_STABLE_WEB_ENV_PATH="$(host_config_value stable.webEnvPath "$AGENTCHAT_DEFAULT_STABLE_WEB_ENV_PATH")"
    AGENTCHAT_STABLE_SERVER_ENV_PATH="$(host_config_value stable.serverEnvPath "$AGENTCHAT_DEFAULT_STABLE_SERVER_ENV_PATH")"
    AGENTCHAT_STABLE_CONVEX_ENV_PATH="$(host_config_value stable.convexEnvPath "$AGENTCHAT_DEFAULT_STABLE_CONVEX_ENV_PATH")"
    AGENTCHAT_STABLE_SERVER_CONFIG_PATH="$(host_config_value stable.serverConfigPath "$AGENTCHAT_DEFAULT_STABLE_SERVER_CONFIG_PATH")"
    export AGENTCHAT_STABLE_CHECKOUT_PATH
    export AGENTCHAT_STABLE_WEB_ENV_PATH
    export AGENTCHAT_STABLE_SERVER_ENV_PATH
    export AGENTCHAT_STABLE_CONVEX_ENV_PATH
    AGENTCHAT_STABLE_CONVEX_RUNTIME_ENV_PATH="$AGENTCHAT_DEFAULT_STABLE_CONVEX_RUNTIME_ENV_PATH"
    export AGENTCHAT_STABLE_SERVER_CONFIG_PATH
    export AGENTCHAT_STABLE_CONVEX_RUNTIME_ENV_PATH
}

stable_pidfile() {
    printf '%s/%s.pid\n' "$AGENTCHAT_STABLE_PID_DIR" "$1"
}

stable_logfile() {
    printf '%s/%s.log\n' "$AGENTCHAT_STABLE_LOG_DIR" "$1"
}

ensure_stable_dirs() {
    mkdir -p \
        "$AGENTCHAT_STABLE_LOG_DIR" \
        "$AGENTCHAT_STABLE_PID_DIR" \
        "$AGENTCHAT_STABLE_XDG_STATE_HOME" \
        "$AGENTCHAT_STABLE_SANDBOX_ROOT" \
        "$AGENTCHAT_HOST_REGISTRY_ROOT" \
        "$(dirname "$AGENTCHAT_STABLE_WEB_ENV_PATH")" \
        "$(dirname "$AGENTCHAT_STABLE_SERVER_ENV_PATH")" \
        "$(dirname "$AGENTCHAT_STABLE_CONVEX_ENV_PATH")" \
        "$(dirname "$AGENTCHAT_STABLE_SERVER_CONFIG_PATH")" \
        "$(dirname "$AGENTCHAT_STABLE_CONVEX_RUNTIME_ENV_PATH")"
}

ensure_host_input_files() {
    if [[ ! -f "$AGENTCHAT_STABLE_WEB_ENV_PATH" ]]; then
        cat > "$AGENTCHAT_STABLE_WEB_ENV_PATH" <<'EOF_WEB'
NEXT_PUBLIC_CONVEX_URL=https://replace-me.convex.cloud
EOF_WEB
        echo "Scaffolded $AGENTCHAT_STABLE_WEB_ENV_PATH"
    fi

    if [[ ! -f "$AGENTCHAT_STABLE_SERVER_ENV_PATH" ]]; then
        cat > "$AGENTCHAT_STABLE_SERVER_ENV_PATH" <<'EOF_SERVER'
BACKEND_TOKEN_SECRET=replace-me
AGENTCHAT_CONVEX_SITE_URL=https://replace-me.convex.site
RUNTIME_INGRESS_SECRET=replace-me
EOF_SERVER
        echo "Scaffolded $AGENTCHAT_STABLE_SERVER_ENV_PATH"
    fi

    if [[ ! -f "$AGENTCHAT_STABLE_CONVEX_ENV_PATH" ]]; then
        cat > "$AGENTCHAT_STABLE_CONVEX_ENV_PATH" <<'EOF_CONVEX'
CONVEX_DEPLOYMENT=prod:replace-me
CONVEX_URL=https://replace-me.convex.cloud
EOF_CONVEX
        echo "Scaffolded $AGENTCHAT_STABLE_CONVEX_ENV_PATH"
    fi

    if [[ ! -f "$AGENTCHAT_STABLE_SERVER_CONFIG_PATH" ]]; then
        cp "$AGENTCHAT_REPO_ROOT/docs/examples/agentchat-stable-server-config.example.json" "$AGENTCHAT_STABLE_SERVER_CONFIG_PATH"
        echo "Scaffolded $AGENTCHAT_STABLE_SERVER_CONFIG_PATH"
    fi

    if [[ ! -f "$AGENTCHAT_STABLE_CONVEX_RUNTIME_ENV_PATH" ]]; then
        cat > "$AGENTCHAT_STABLE_CONVEX_RUNTIME_ENV_PATH" <<'EOF_RUNTIME'
CONVEX_DEPLOYMENT=prod:replace-me
SITE_URL=http://localhost:4040
AUTH_GOOGLE_ID=replace-me
AUTH_GOOGLE_SECRET=replace-me
BACKEND_TOKEN_SECRET=replace-me
RUNTIME_INGRESS_SECRET=replace-me
JWKS=replace-me
JWT_PRIVATE_KEY=replace-me
ENCRYPTION_KEY=replace-me
EOF_RUNTIME
        echo "Scaffolded $AGENTCHAT_STABLE_CONVEX_RUNTIME_ENV_PATH"
    fi
}

render_stable_runtime_files() {
    CHECKOUT_PATH="$AGENTCHAT_STABLE_CHECKOUT_PATH" \
    WEB_ENV_SOURCE="$AGENTCHAT_STABLE_WEB_ENV_PATH" \
    SERVER_ENV_SOURCE="$AGENTCHAT_STABLE_SERVER_ENV_PATH" \
    CONVEX_ENV_SOURCE="$AGENTCHAT_STABLE_CONVEX_ENV_PATH" \
    SERVER_CONFIG_SOURCE="$AGENTCHAT_STABLE_SERVER_CONFIG_PATH" \
    STABLE_XDG_STATE_HOME="$AGENTCHAT_STABLE_XDG_STATE_HOME" \
    STABLE_SANDBOX_ROOT="$AGENTCHAT_STABLE_SANDBOX_ROOT" \
    STABLE_STATE_ID="$AGENTCHAT_STABLE_STATE_ID" \
    STABLE_WEB_PORT="$AGENTCHAT_STABLE_WEB_PORT" \
    STABLE_SERVER_PORT="$AGENTCHAT_STABLE_SERVER_PORT" \
    STABLE_WEB_URL="$AGENTCHAT_STABLE_WEB_URL" \
    STABLE_SERVER_URL="$AGENTCHAT_STABLE_SERVER_URL" \
    python3 - <<'PYRENDER'
import json
import os
from pathlib import Path


def parse_env(path_str: str) -> dict[str, str]:
    path = Path(path_str)
    values: dict[str, str] = {}
    if not path.exists():
        return values
    for raw_line in path.read_text().splitlines():
        line = raw_line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, value = line.split('=', 1)
        values[key.strip()] = value.strip()
    return values


def write_env(path: Path, values: dict[str, str], heading: str) -> None:
    lines = [heading, '']
    for key in sorted(values):
        value = values[key]
        if value:
            lines.append(f'{key}={value}')
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text('\n'.join(lines) + '\n')

checkout = Path(os.environ['CHECKOUT_PATH'])
web_source = parse_env(os.environ['WEB_ENV_SOURCE'])
server_source = parse_env(os.environ['SERVER_ENV_SOURCE'])
convex_source = parse_env(os.environ['CONVEX_ENV_SOURCE'])
server_config_source = Path(os.environ['SERVER_CONFIG_SOURCE'])
if not server_config_source.exists():
    raise SystemExit(f'Missing stable server config source: {server_config_source}')
server_config = json.loads(server_config_source.read_text())
server_config['stateId'] = os.environ['STABLE_STATE_ID']
server_config['sandboxRoot'] = os.environ['STABLE_SANDBOX_ROOT']

web_values = dict(web_source)
web_values['HOST'] = web_source.get('HOST', '0.0.0.0')
web_values['PORT'] = os.environ['STABLE_WEB_PORT']
web_values['NEXT_PUBLIC_AGENTCHAT_SERVER_URL'] = web_source.get(
    'NEXT_PUBLIC_AGENTCHAT_SERVER_URL',
    os.environ['STABLE_SERVER_URL'],
)
if 'NEXT_PUBLIC_CONVEX_URL' not in web_values and convex_source.get('CONVEX_URL'):
    web_values['NEXT_PUBLIC_CONVEX_URL'] = convex_source['CONVEX_URL']

server_values = dict(server_source)
server_values['HOST'] = server_source.get('HOST', '0.0.0.0')
server_values['PORT'] = os.environ['STABLE_SERVER_PORT']
server_values['XDG_STATE_HOME'] = os.environ['STABLE_XDG_STATE_HOME']
if 'AGENTCHAT_CONVEX_SITE_URL' not in server_values and convex_source.get('CONVEX_URL'):
    server_values['AGENTCHAT_CONVEX_SITE_URL'] = convex_source['CONVEX_URL'].replace('.cloud', '.site')

write_env(
    checkout / 'apps/web/.env.local',
    web_values,
    '# Generated by scripts/host/install-stable.sh',
)
write_env(
    checkout / 'apps/server/.env.local',
    server_values,
    '# Generated by scripts/host/install-stable.sh',
)
write_env(
    checkout / 'packages/convex/.env.local',
    convex_source,
    '# Generated by scripts/host/install-stable.sh',
)
(checkout / 'apps/server').mkdir(parents=True, exist_ok=True)
(checkout / 'apps/server/agentchat.config.json').write_text(
    json.dumps(server_config, indent=4) + '\n',
)
PYRENDER
}

update_host_registry_for_stable() {
    CHECKOUT_PATH="$AGENTCHAT_STABLE_CHECKOUT_PATH" \
    REGISTRY_PATH="$AGENTCHAT_HOST_REGISTRY_PATH" \
    PORT_LEASES_PATH="$AGENTCHAT_HOST_PORT_LEASES_PATH" \
    STABLE_WEB_ENV="$AGENTCHAT_STABLE_CHECKOUT_PATH/apps/web/.env.local" \
    STABLE_SERVER_ENV="$AGENTCHAT_STABLE_CHECKOUT_PATH/apps/server/.env.local" \
    STABLE_WEB_PORT="$AGENTCHAT_STABLE_WEB_PORT" \
    STABLE_SERVER_PORT="$AGENTCHAT_STABLE_SERVER_PORT" \
    python3 - <<'PYREG'
import json
import os
from datetime import datetime, timezone
from pathlib import Path


def parse_env(path_str: str) -> dict[str, str]:
    path = Path(path_str)
    values: dict[str, str] = {}
    if not path.exists():
        return values
    for raw_line in path.read_text().splitlines():
        line = raw_line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, value = line.split('=', 1)
        values[key.strip()] = value.strip()
    return values

registry_path = Path(os.environ['REGISTRY_PATH'])
registry_path.parent.mkdir(parents=True, exist_ok=True)
registry = {
    'version': 1,
    'stableCheckoutPath': os.environ['CHECKOUT_PATH'],
    'stableConvexSiteUrl': None,
    'stableConvexCloudUrl': None,
}
if registry_path.exists():
    try:
        registry |= json.loads(registry_path.read_text())
    except Exception:
        pass
web_env = parse_env(os.environ['STABLE_WEB_ENV'])
server_env = parse_env(os.environ['STABLE_SERVER_ENV'])
updated_at = datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')
registry['stableCheckoutPath'] = os.environ['CHECKOUT_PATH']
registry['stableConvexCloudUrl'] = web_env.get('NEXT_PUBLIC_CONVEX_URL')
registry['stableConvexSiteUrl'] = server_env.get('AGENTCHAT_CONVEX_SITE_URL')
registry['updatedAt'] = updated_at
registry_path.write_text(json.dumps(registry, indent=4) + '\n')

leases_path = Path(os.environ['PORT_LEASES_PATH'])
leases_path.parent.mkdir(parents=True, exist_ok=True)
port_leases = {'version': 1, 'leases': []}
if leases_path.exists():
    try:
        port_leases |= json.loads(leases_path.read_text())
    except Exception:
        pass
filtered = [
    lease
    for lease in port_leases.get('leases', [])
    if not (
        lease.get('laneId') == 'stable-install'
        and lease.get('checkoutPath') == os.environ['CHECKOUT_PATH']
    )
]
filtered.extend([
    {
        'laneId': 'stable-install',
        'checkoutPath': os.environ['CHECKOUT_PATH'],
        'service': 'web',
        'port': int(os.environ['STABLE_WEB_PORT']),
        'updatedAt': updated_at,
    },
    {
        'laneId': 'stable-install',
        'checkoutPath': os.environ['CHECKOUT_PATH'],
        'service': 'server',
        'port': int(os.environ['STABLE_SERVER_PORT']),
        'updatedAt': updated_at,
    },
])
port_leases['leases'] = sorted(filtered, key=lambda lease: (lease['port'], lease['service']))
leases_path.write_text(json.dumps(port_leases, indent=4) + '\n')
PYREG
}

wait_for_port() {
    local port="$1"
    local timeout_seconds="$2"
    PORT="$port" TIMEOUT_SECONDS="$timeout_seconds" python3 - <<'PYWAIT'
import os
import socket
import time

port = int(os.environ['PORT'])
timeout_seconds = float(os.environ['TIMEOUT_SECONDS'])
deadline = time.time() + timeout_seconds
while time.time() < deadline:
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(0.5)
    try:
        sock.connect(('127.0.0.1', port))
    except OSError:
        time.sleep(0.2)
    else:
        sock.close()
        raise SystemExit(0)
    finally:
        try:
            sock.close()
        except OSError:
            pass
raise SystemExit(1)
PYWAIT
}

ensure_port_available() {
    local port="$1"
    local label="$2"
    if wait_for_port "$port" 0.2; then
        echo "$label port $port is already in use." >&2
        return 1
    fi
}

service_pid_running() {
    local service="$1"
    local pidfile
    pidfile="$(stable_pidfile "$service")"
    if [[ ! -f "$pidfile" ]]; then
        return 1
    fi
    local pid
    pid="$(cat "$pidfile")"
    if [[ -z "$pid" ]]; then
        return 1
    fi
    kill -0 "$pid" 2>/dev/null
}

start_stable_service() {
    local service="$1"
    local command="$2"
    local pidfile logfile
    pidfile="$(stable_pidfile "$service")"
    logfile="$(stable_logfile "$service")"
    if service_pid_running "$service"; then
        echo "$service is already running." >&2
        return 0
    fi
    (
        cd "$AGENTCHAT_STABLE_CHECKOUT_PATH"
        AGENTCHAT_STABLE_LOG_PATH="$logfile" \
            setsid sh -lc "exec ${command} >> \"\$AGENTCHAT_STABLE_LOG_PATH\" 2>&1" \
            </dev/null >/dev/null 2>&1 &
        echo $! > "$pidfile"
    )
}

stop_stable_service() {
    local service="$1"
    local pidfile
    pidfile="$(stable_pidfile "$service")"
    if [[ ! -f "$pidfile" ]]; then
        return 0
    fi
    local pid
    pid="$(cat "$pidfile")"
    rm -f "$pidfile"
    if [[ -z "$pid" ]]; then
        return 0
    fi
    if ! kill -0 "$pid" 2>/dev/null; then
        return 0
    fi
    kill -TERM -- "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
    for _ in $(seq 1 25); do
        if ! kill -0 "$pid" 2>/dev/null; then
            return 0
        fi
        sleep 0.2
    done
    kill -KILL -- "-$pid" 2>/dev/null || kill -KILL "$pid" 2>/dev/null || true
}

require_stable_checkout() {
    if [[ ! -d "$AGENTCHAT_STABLE_CHECKOUT_PATH/.git" ]]; then
        echo "Stable checkout not found at $AGENTCHAT_STABLE_CHECKOUT_PATH. Run scripts/host/install-stable.sh first." >&2
        exit 1
    fi
}

require_host_inputs() {
    local missing=0
    for path in \
        "$AGENTCHAT_STABLE_WEB_ENV_PATH" \
        "$AGENTCHAT_STABLE_SERVER_ENV_PATH" \
        "$AGENTCHAT_STABLE_CONVEX_ENV_PATH" \
        "$AGENTCHAT_STABLE_SERVER_CONFIG_PATH" \
        "$AGENTCHAT_STABLE_CONVEX_RUNTIME_ENV_PATH"
    do
        if [[ ! -f "$path" ]]; then
            echo "Missing required host input: $path" >&2
            missing=1
        fi
    done
    if [[ "$missing" -ne 0 ]]; then
        exit 1
    fi
}

render_and_register_stable_checkout() {
    render_stable_runtime_files
    update_host_registry_for_stable
}
