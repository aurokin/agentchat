#!/usr/bin/env bash
set -euo pipefail

DEFAULT_BUILD_DIR="$(pwd)/build/ios"
FALLBACK_BUILD_DIR="$(pwd)/build"
BUILD_DIR="${1:-$DEFAULT_BUILD_DIR}"

if [[ -z "${1-}" && ! -d "$BUILD_DIR" && -d "$FALLBACK_BUILD_DIR" ]]; then
    BUILD_DIR="$FALLBACK_BUILD_DIR"
fi

if [[ ! -d "$BUILD_DIR" ]]; then
    echo "Build directory not found: $BUILD_DIR" >&2
    exit 1
fi

latest_tar=""
if compgen -G "$BUILD_DIR/*.tar.gz" > /dev/null; then
    latest_tar=$(ls -t "$BUILD_DIR"/*.tar.gz | head -n 1)
fi

if [[ -z "$latest_tar" ]]; then
    echo "No .tar.gz files found in $BUILD_DIR" >&2
    exit 1
fi

rm -rf "$BUILD_DIR/RouterChat" "$BUILD_DIR/RouterChat.app"
tar -xzf "$latest_tar" -C "$BUILD_DIR"

app_path="$BUILD_DIR/RouterChat.app"
if [[ ! -d "$app_path" ]]; then
    if [[ -d "$BUILD_DIR/RouterChat/RouterChat.app" ]]; then
        app_path="$BUILD_DIR/RouterChat/RouterChat.app"
    else
        echo "RouterChat.app not found after extracting $latest_tar" >&2
        exit 1
    fi
fi

xcrun simctl install booted "$app_path"
echo "Installed $app_path"
