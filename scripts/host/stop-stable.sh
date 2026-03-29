#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "$0")" && pwd)/lib.sh"
load_host_paths
ensure_stable_dirs

stop_stable_service web
stop_stable_service server

echo "Stable services stopped."
