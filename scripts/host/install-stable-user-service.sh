#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "$0")" && pwd)/lib.sh"
load_host_paths
ensure_stable_dirs
require_host_inputs
require_stable_checkout
render_and_register_stable_checkout

USER_UNIT_DIR="${HOME}/.config/systemd/user"
UNIT_PATH="${USER_UNIT_DIR}/agentchat-stable.service"
ENABLE=0
START_NOW=0
SERVICE_PATH="${PATH}"

for arg in "$@"; do
    case "$arg" in
        --enable)
            ENABLE=1
            ;;
        --now)
            START_NOW=1
            ;;
        --enable-now)
            ENABLE=1
            START_NOW=1
            ;;
        *)
            echo "Unknown argument: $arg" >&2
            echo "Usage: scripts/host/install-stable-user-service.sh [--enable] [--now] [--enable-now]" >&2
            exit 1
            ;;
    esac
done

mkdir -p "$USER_UNIT_DIR"

cat > "$UNIT_PATH" <<EOF_UNIT
[Unit]
Description=Agentchat stable host instance
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=$AGENTCHAT_STABLE_CHECKOUT_PATH
ExecStart=$AGENTCHAT_STABLE_CHECKOUT_PATH/scripts/host/start-stable.sh
ExecStop=$AGENTCHAT_STABLE_CHECKOUT_PATH/scripts/host/stop-stable.sh
ExecReload=$AGENTCHAT_STABLE_CHECKOUT_PATH/scripts/host/update-stable.sh
TimeoutStartSec=900
TimeoutStopSec=180
Environment=HOME=%h
Environment=PATH=$SERVICE_PATH

[Install]
WantedBy=default.target
EOF_UNIT

systemctl --user daemon-reload

if [[ "$ENABLE" -eq 1 ]]; then
    systemctl --user enable agentchat-stable.service
fi

if [[ "$START_NOW" -eq 1 ]]; then
    if service_pid_running web || service_pid_running server; then
        "$AGENTCHAT_HOST_SCRIPT_DIR/stop-stable.sh"
    fi
    systemctl --user reset-failed agentchat-stable.service >/dev/null 2>&1 || true
    systemctl --user restart agentchat-stable.service
fi

echo "Installed user service: $UNIT_PATH"
echo "Next commands:"
echo "- systemctl --user status agentchat-stable.service"
echo "- systemctl --user restart agentchat-stable.service"
echo "- systemctl --user stop agentchat-stable.service"
echo "- journalctl --user -u agentchat-stable.service -n 200"
echo "If you want it to start before login, enable linger separately:"
echo "- sudo loginctl enable-linger \"$USER\""
