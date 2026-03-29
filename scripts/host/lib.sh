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
AGENTCHAT_DEFAULT_STABLE_CHECKOUT_PATH="${HOME}/code/agentchat/stable"
AGENTCHAT_DEFAULT_STABLE_WEB_ENV_PATH="${HOME}/.config/agentchat/stable/web.env"
AGENTCHAT_DEFAULT_STABLE_SERVER_ENV_PATH="${HOME}/.config/agentchat/stable/server.env"
AGENTCHAT_DEFAULT_STABLE_CONVEX_ENV_PATH="${HOME}/.config/agentchat/stable/convex.env"
AGENTCHAT_DEFAULT_STABLE_SERVER_CONFIG_PATH="${HOME}/.config/agentchat/stable/server-config.json"
AGENTCHAT_DEFAULT_STABLE_CONVEX_RUNTIME_ENV_PATH="${HOME}/.config/agentchat/stable/convex-runtime.env"
AGENTCHAT_STABLE_WEB_PORT=4040
AGENTCHAT_STABLE_SERVER_PORT=3030
AGENTCHAT_STABLE_WEB_URL="http://localhost:${AGENTCHAT_STABLE_WEB_PORT}"
AGENTCHAT_STABLE_SERVER_URL="http://localhost:${AGENTCHAT_STABLE_SERVER_PORT}"
AGENTCHAT_FILE_LOCK_STALE_SECONDS=5
AGENTCHAT_FILE_LOCK_WAIT_SECONDS=5
AGENTCHAT_HOST_HELPER_DIR="$AGENTCHAT_HOST_SCRIPT_DIR"
AGENTCHAT_DEFAULT_DEV_HOST="127.0.0.1"
AGENTCHAT_DEFAULT_STABLE_HOST="127.0.0.1"

with_host_file_lock() {
    local lock_path="$1"
    shift

    mkdir -p "$(dirname "$lock_path")"
    local deadline=$((SECONDS + AGENTCHAT_FILE_LOCK_WAIT_SECONDS))

    while ! mkdir "$lock_path" 2>/dev/null; do
        if [[ -d "$lock_path" ]]; then
            local now epoch_mtime
            now="$(date +%s)"
            epoch_mtime="$(stat -c %Y "$lock_path" 2>/dev/null || echo 0)"
            if (( now - epoch_mtime >= AGENTCHAT_FILE_LOCK_STALE_SECONDS )); then
                rm -rf "$lock_path"
                continue
            fi
        fi

        if (( SECONDS >= deadline )); then
            echo "Timed out acquiring file lock for $lock_path" >&2
            return 1
        fi

        sleep 0.05
    done

    local exit_code=0
    "$@" || exit_code=$?
    rm -rf "$lock_path"
    return "$exit_code"
}

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
    AGENTCHAT_DEV_DEFAULT_HOST="$(host_config_value dev.defaultHost "$AGENTCHAT_DEFAULT_DEV_HOST")"
    AGENTCHAT_STABLE_DEFAULT_HOST="$(host_config_value stable.defaultHost "$AGENTCHAT_DEFAULT_STABLE_HOST")"
    AGENTCHAT_STABLE_WEB_ENV_PATH="$(host_config_value stable.webEnvPath "$AGENTCHAT_DEFAULT_STABLE_WEB_ENV_PATH")"
    AGENTCHAT_STABLE_SERVER_ENV_PATH="$(host_config_value stable.serverEnvPath "$AGENTCHAT_DEFAULT_STABLE_SERVER_ENV_PATH")"
    AGENTCHAT_STABLE_CONVEX_ENV_PATH="$(host_config_value stable.convexEnvPath "$AGENTCHAT_DEFAULT_STABLE_CONVEX_ENV_PATH")"
    AGENTCHAT_STABLE_SERVER_CONFIG_PATH="$(host_config_value stable.serverConfigPath "$AGENTCHAT_DEFAULT_STABLE_SERVER_CONFIG_PATH")"
    export AGENTCHAT_STABLE_CHECKOUT_PATH
    export AGENTCHAT_DEV_DEFAULT_HOST
    export AGENTCHAT_STABLE_DEFAULT_HOST
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

stable_service_envfile() {
    local service="$1"
    case "$service" in
        server)
            printf '%s\n' "$AGENTCHAT_STABLE_CHECKOUT_PATH/apps/server/.env.local"
            ;;
        web)
            printf '%s\n' "$AGENTCHAT_STABLE_CHECKOUT_PATH/apps/web/.env.local"
            ;;
        *)
            echo "Unknown stable service: $service" >&2
            return 1
            ;;
    esac
}

stable_service_host() {
    local service="$1"
    local envfile
    envfile="$(stable_service_envfile "$service")" || return 1
    HOST_ENVFILE="$envfile" HOST_HELPER_DIR="$AGENTCHAT_HOST_HELPER_DIR" DEFAULT_HOST="$AGENTCHAT_STABLE_DEFAULT_HOST" python3 - <<'PY'
import os
import sys

sys.path.append(os.environ["HOST_HELPER_DIR"])
from envfile import parse_env_file

value = parse_env_file(os.environ["HOST_ENVFILE"]).get("HOST", "").strip()
if value in ("", "0.0.0.0", "127.0.0.1", "localhost", "::", "::0"):
    print(os.environ["DEFAULT_HOST"])
else:
    print(value)
PY
}

stable_probe_host() {
    local host="${1:-}"
    case "$host" in
        ""|"0.0.0.0"|"127.0.0.1"|"localhost"|"::"|"::0")
            printf '%s\n' "127.0.0.1"
            ;;
        *)
            printf '%s\n' "$host"
            ;;
    esac
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
    HOST_HELPER_DIR="$AGENTCHAT_HOST_HELPER_DIR" \
    STABLE_XDG_STATE_HOME="$AGENTCHAT_STABLE_XDG_STATE_HOME" \
    STABLE_SANDBOX_ROOT="$AGENTCHAT_STABLE_SANDBOX_ROOT" \
    STABLE_STATE_ID="$AGENTCHAT_STABLE_STATE_ID" \
    STABLE_DEFAULT_HOST="$AGENTCHAT_STABLE_DEFAULT_HOST" \
    STABLE_WEB_PORT="$AGENTCHAT_STABLE_WEB_PORT" \
    STABLE_SERVER_PORT="$AGENTCHAT_STABLE_SERVER_PORT" \
    STABLE_WEB_URL="$AGENTCHAT_STABLE_WEB_URL" \
    STABLE_SERVER_URL="$AGENTCHAT_STABLE_SERVER_URL" \
    python3 - <<'PYRENDER'
import json
import os
import sys
from pathlib import Path

sys.path.append(os.environ["HOST_HELPER_DIR"])
from envfile import parse_env_file, write_env_file

def resolve_host(value: str | None, default_host: str) -> str:
    if value is None:
        return default_host
    trimmed = value.strip()
    return default_host if not trimmed or trimmed in {"0.0.0.0", "127.0.0.1", "localhost"} else trimmed

checkout = Path(os.environ['CHECKOUT_PATH'])
web_source = parse_env_file(os.environ['WEB_ENV_SOURCE'])
server_source = parse_env_file(os.environ['SERVER_ENV_SOURCE'])
convex_source = parse_env_file(os.environ['CONVEX_ENV_SOURCE'])
server_config_source = Path(os.environ['SERVER_CONFIG_SOURCE'])
if not server_config_source.exists():
    raise SystemExit(f'Missing stable server config source: {server_config_source}')
server_config = json.loads(server_config_source.read_text())
server_config['stateId'] = os.environ['STABLE_STATE_ID']
server_config['sandboxRoot'] = os.environ['STABLE_SANDBOX_ROOT']

web_values = dict(web_source)
web_values['HOST'] = resolve_host(web_source.get('HOST'), os.environ['STABLE_DEFAULT_HOST'])
web_values['PORT'] = os.environ['STABLE_WEB_PORT']
web_values['NEXT_PUBLIC_AGENTCHAT_SERVER_URL'] = web_source.get(
    'NEXT_PUBLIC_AGENTCHAT_SERVER_URL',
    os.environ['STABLE_SERVER_URL'],
)
if 'NEXT_PUBLIC_CONVEX_URL' not in web_values and convex_source.get('CONVEX_URL'):
    web_values['NEXT_PUBLIC_CONVEX_URL'] = convex_source['CONVEX_URL']

server_values = dict(server_source)
server_values['HOST'] = resolve_host(server_source.get('HOST'), os.environ['STABLE_DEFAULT_HOST'])
server_values['PORT'] = os.environ['STABLE_SERVER_PORT']
server_values['XDG_STATE_HOME'] = os.environ['STABLE_XDG_STATE_HOME']
if 'AGENTCHAT_CONVEX_SITE_URL' not in server_values and convex_source.get('CONVEX_URL'):
    server_values['AGENTCHAT_CONVEX_SITE_URL'] = convex_source['CONVEX_URL'].replace('.cloud', '.site')

write_env_file(
    str(checkout / 'apps/web/.env.local'),
    web_values,
    '# Generated by scripts/host/install-stable.sh',
)
write_env_file(
    str(checkout / 'apps/server/.env.local'),
    server_values,
    '# Generated by scripts/host/install-stable.sh',
)
write_env_file(
    str(checkout / 'packages/convex/.env.local'),
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
    local registry_lock_path="${AGENTCHAT_HOST_REGISTRY_PATH}.lock"
    local leases_lock_path="${AGENTCHAT_HOST_PORT_LEASES_PATH}.lock"

    with_host_file_lock "$registry_lock_path" env \
        CHECKOUT_PATH="$AGENTCHAT_STABLE_CHECKOUT_PATH" \
        REGISTRY_PATH="$AGENTCHAT_HOST_REGISTRY_PATH" \
        STABLE_WEB_ENV="$AGENTCHAT_STABLE_CHECKOUT_PATH/apps/web/.env.local" \
        STABLE_SERVER_ENV="$AGENTCHAT_STABLE_CHECKOUT_PATH/apps/server/.env.local" \
        HOST_HELPER_DIR="$AGENTCHAT_HOST_HELPER_DIR" \
        python3 - <<'PYREG'
import json
import os
import tempfile
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.append(os.environ["HOST_HELPER_DIR"])
from envfile import parse_env_file

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
web_env = parse_env_file(os.environ['STABLE_WEB_ENV'])
server_env = parse_env_file(os.environ['STABLE_SERVER_ENV'])
updated_at = datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')
registry['stableCheckoutPath'] = os.environ['CHECKOUT_PATH']
registry['stableConvexCloudUrl'] = web_env.get('NEXT_PUBLIC_CONVEX_URL')
registry['stableConvexSiteUrl'] = server_env.get('AGENTCHAT_CONVEX_SITE_URL')
registry['updatedAt'] = updated_at
with tempfile.NamedTemporaryFile(
    "w",
    encoding="utf-8",
    delete=False,
    dir=registry_path.parent,
) as handle:
    handle.write(json.dumps(registry, indent=4) + '\n')
    temp_path = Path(handle.name)
temp_path.replace(registry_path)
PYREG

    with_host_file_lock "$leases_lock_path" env \
        CHECKOUT_PATH="$AGENTCHAT_STABLE_CHECKOUT_PATH" \
        PORT_LEASES_PATH="$AGENTCHAT_HOST_PORT_LEASES_PATH" \
        STABLE_WEB_PORT="$AGENTCHAT_STABLE_WEB_PORT" \
        STABLE_SERVER_PORT="$AGENTCHAT_STABLE_SERVER_PORT" \
        python3 - <<'PYLEASES'
import json
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path

leases_path = Path(os.environ['PORT_LEASES_PATH'])
leases_path.parent.mkdir(parents=True, exist_ok=True)
port_leases = {'version': 1, 'leases': []}
if leases_path.exists():
    try:
        port_leases |= json.loads(leases_path.read_text())
    except Exception:
        pass
updated_at = datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')
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
with tempfile.NamedTemporaryFile(
    "w",
    encoding="utf-8",
    delete=False,
    dir=leases_path.parent,
) as handle:
    handle.write(json.dumps(port_leases, indent=4) + '\n')
    temp_path = Path(handle.name)
temp_path.replace(leases_path)
PYLEASES
}

wait_for_port() {
    local host="$1"
    local port="$2"
    local timeout_seconds="$3"
    HOST="$host" PORT="$port" TIMEOUT_SECONDS="$timeout_seconds" python3 - <<'PYWAIT'
import os
import socket
import time

host = os.environ['HOST'].strip()
port = int(os.environ['PORT'])
timeout_seconds = float(os.environ['TIMEOUT_SECONDS'])
deadline = time.time() + timeout_seconds
probe_host = '127.0.0.1' if host in ('', '127.0.0.1', '0.0.0.0', 'localhost', '::', '::0') else host
while time.time() < deadline:
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(0.5)
    try:
        sock.connect((probe_host, port))
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
    local host="$1"
    local port="$2"
    local label="$3"
    if wait_for_port "$host" "$port" 0.2; then
        echo "$label port $port is already in use on ${host}." >&2
        return 1
    fi
}

service_pid_running() {
    local service="$1"
    local pidfile pid start_token expected_json
    pidfile="$(stable_pidfile "$service")"
    if [[ ! -f "$pidfile" ]]; then
        return 1
    fi
    pid="$(python3 - <<'PY' "$pidfile"
import json, sys
from pathlib import Path
path = Path(sys.argv[1])
try:
    data = json.loads(path.read_text())
except Exception:
    raise SystemExit(1)
if isinstance(data, int):
    print(data)
elif isinstance(data, dict):
    print(data.get("pid", ""))
else:
    raise SystemExit(1)
PY
)" || return 1
    start_token="$(python3 - <<'PY' "$pidfile"
import json, sys
from pathlib import Path
path = Path(sys.argv[1])
try:
    data = json.loads(path.read_text())
except Exception:
    raise SystemExit(1)
if isinstance(data, dict):
    print(data.get("startToken", ""))
elif isinstance(data, int):
    print("")
else:
    raise SystemExit(1)
PY
)" || return 1
    if [[ -z "$pid" ]]; then
        return 1
    fi
    expected_json="$(stable_service_command_json "$service")"
    SERVICE_PID="$pid" \
    EXPECTED_JSON="$expected_json" \
    EXPECTED_START_TOKEN="$start_token" \
    python3 - <<'PY'
import json
import os
import subprocess
from pathlib import Path

pid = os.environ["SERVICE_PID"]
expected = json.loads(os.environ["EXPECTED_JSON"])
expected_start_token = os.environ["EXPECTED_START_TOKEN"]

proc_path = Path(f"/proc/{pid}")
if proc_path.exists():
    try:
        argv = [
            part
            for part in (proc_path / "cmdline").read_text().split("\0")
            if part
        ]
        stat = (proc_path / "stat").read_text()
        stat_end = stat.rfind(")")
        fields = stat[stat_end + 2 :].strip().split()
        start_token = fields[19] if len(fields) > 19 else ""
    except Exception:
        raise SystemExit(1)
else:
    try:
        argv = subprocess.check_output(
            ["ps", "-o", "command=", "-p", pid],
            text=True,
            stderr=subprocess.DEVNULL,
        ).strip().split()
        start_token = subprocess.check_output(
            ["ps", "-o", "lstart=", "-p", pid],
            text=True,
            stderr=subprocess.DEVNULL,
        ).strip()
    except Exception:
        raise SystemExit(1)

def normalize(part: str) -> str:
    return Path(part).name if "/" in part else part

actual = [normalize(part) for part in argv]
wanted = [normalize(part) for part in expected]
actual_index = 0
for expected_part in wanted:
    while actual_index < len(actual) and actual[actual_index] != expected_part:
        actual_index += 1
    if actual_index >= len(actual):
        raise SystemExit(1)
    actual_index += 1

if expected_start_token and start_token and expected_start_token != start_token:
    raise SystemExit(1)
PY
}

stable_service_command_json() {
    local service="$1"
    case "$service" in
        server)
            printf '%s\n' '["bun","run","--cwd","apps/server","start"]'
            ;;
        web)
            printf '%s\n' '["bun","run","--cwd","apps/web","start"]'
            ;;
        *)
            echo "Unknown stable service: $service" >&2
            return 1
            ;;
    esac
}

stable_service_command_parts() {
    local service="$1"
    case "$service" in
        server)
            printf '%s\n' bun run --cwd apps/server start
            ;;
        web)
            printf '%s\n' bun run --cwd apps/web start
            ;;
        *)
            echo "Unknown stable service: $service" >&2
            return 1
            ;;
    esac
}

stable_process_start_token() {
    local pid="$1"
    python3 - <<'PY' "$pid"
import subprocess
import sys
from pathlib import Path

pid = sys.argv[1]
proc_path = Path(f"/proc/{pid}")
if proc_path.exists():
    stat = (proc_path / "stat").read_text()
    stat_end = stat.rfind(")")
    fields = stat[stat_end + 2 :].strip().split()
    print(fields[19] if len(fields) > 19 else "")
else:
    print(
        subprocess.check_output(
            ["ps", "-o", "lstart=", "-p", pid],
            text=True,
            stderr=subprocess.DEVNULL,
        ).strip()
    )
PY
}

start_stable_service() {
    local service="$1"
    local pidfile logfile envfile pid pgid start_token
    shift
    pidfile="$(stable_pidfile "$service")"
    logfile="$(stable_logfile "$service")"
    envfile="$(stable_service_envfile "$service")"
    if service_pid_running "$service"; then
        echo "$service is already running." >&2
        return 0
    fi
    (
        cd "$AGENTCHAT_STABLE_CHECKOUT_PATH"
        set -a
        source "$envfile"
        set +a
        setsid "$@" >>"$logfile" 2>&1 </dev/null &
        pid=$!
        for _ in $(seq 1 20); do
            pgid="$(ps -o pgid= -p "$pid" 2>/dev/null | tr -d ' ')"
            if [[ -n "$pgid" ]]; then
                break
            fi
            sleep 0.05
        done
        start_token="$(stable_process_start_token "$pid")"
        python3 - <<'PY' "$pidfile" "$pid" "$pgid" "$start_token"
import json
import sys
from pathlib import Path

pidfile = Path(sys.argv[1])
pidfile.write_text(
    json.dumps(
        {
            "pid": int(sys.argv[2]),
            "pgid": int(sys.argv[3]) if sys.argv[3] else int(sys.argv[2]),
            "startToken": sys.argv[4],
        },
        indent=4,
    )
    + "\n"
)
PY
    )
}

stop_stable_service() {
    local service="$1"
    local pidfile pid pgid owned=0
    pidfile="$(stable_pidfile "$service")"
    if [[ ! -f "$pidfile" ]]; then
        return 0
    fi
    pid="$(python3 - <<'PY' "$pidfile"
import json, sys
from pathlib import Path
path = Path(sys.argv[1])
try:
    data = json.loads(path.read_text())
except Exception:
    raise SystemExit(1)
if isinstance(data, int):
    print(data)
elif isinstance(data, dict):
    print(data.get("pid", ""))
else:
    raise SystemExit(1)
PY
)" || true
    pgid="$(python3 - <<'PY' "$pidfile"
import json, sys
from pathlib import Path
path = Path(sys.argv[1])
try:
    data = json.loads(path.read_text())
except Exception:
    raise SystemExit(1)
if isinstance(data, int):
    print(data)
elif isinstance(data, dict):
    print(data.get("pgid", ""))
else:
    raise SystemExit(1)
PY
)" || true
    if [[ -n "$pid" ]] && service_pid_running "$service"; then
        owned=1
    fi
    rm -f "$pidfile"
    if [[ -z "$pid" ]] || [[ "$owned" -ne 1 ]]; then
        return 0
    fi
    kill -TERM -- "-${pgid:-$pid}" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
    for _ in $(seq 1 25); do
        if ! service_pid_running "$service"; then
            return 0
        fi
        sleep 0.2
    done
    kill -KILL -- "-${pgid:-$pid}" 2>/dev/null || kill -KILL "$pid" 2>/dev/null || true
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
