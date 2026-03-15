# Mobile Integration Testing

This document defines the supported mobile testing boundaries for Agentchat so we do not design workflows that the current host platform cannot run.

## Scope

Agentchat mobile testing currently targets:

- Expo app in `apps/mobile`
- local Agentchat backend in `apps/server`
- Convex-backed persistence and auth
- manually invoked testing only

Do not treat every mobile path as equally automatable from every machine.

## Platform Matrix

### Linux Host

Supported:

- Android physical device testing over `adb`
- Android emulator testing if Android SDK, emulator, and hardware virtualization are installed
- Expo Go on physical iOS devices over LAN or tunnel when the current Expo Go release supports this repo's SDK
- EAS development builds for physical iOS devices
- Web-based and server-side confidence commands

Not supported:

- iOS simulator
- local Xcode builds
- direct local native iOS build/install workflows

### macOS Host

Supported:

- everything listed for Linux
- iOS simulator
- local native iOS build/install workflows

## Current Agentchat Recommendation

For this Linux-based environment:

1. Treat Android as the primary native automation target.
2. Treat iOS as manual-device testing only.
3. Treat Expo Go on iOS as best-effort only.
4. Use an EAS development build for reliable iPhone testing.
5. Reserve iOS simulator automation for a future macOS runner or developer machine.

## Expo Go Guidance

The current mobile app may work in Expo Go when the installed Expo Go release supports the Expo SDK used by this repo.

Current caveats:

- Expo Go is a manual-device path, not an automation path.
- App Store Expo Go availability can lag behind the SDK used by this repo.
- Android share-intent behavior depends on the custom Android plugin and should not be treated as validated in Expo Go.
- If native requirements expand later, Expo Go support may stop being sufficient; document that change when it happens.

Observed current state:

- this repo currently uses Expo SDK 55
- iPhone Expo Go may reject the app if the App Store build does not yet support that SDK
- when that happens, use the EAS development-build path instead

## Fast Manual iPhone Path (Best Effort)

From this Linux server, the fastest likely route to an iPhone is:

1. Ensure `apps/mobile/.env` points at the reachable local services.
2. Start Metro in LAN mode:

```bash
cd apps/mobile
bun run start -- --lan
```

3. Open Expo Go on the iPhone.
4. Scan the QR code.

Required env values for this path:

- `EXPO_PUBLIC_CONVEX_URL=https://<deployment>.convex.cloud`
- `EXPO_PUBLIC_AGENTCHAT_SERVER_URL=http://<reachable-lan-host>:3030`

Use the Linux host's LAN IP, not `localhost`, for the backend server URL when testing from another device.

## Reliable iPhone Path: EAS Development Build

From this Linux server, the reliable iPhone path is a remote EAS development build for a physical device.

Prerequisites:

- Expo account logged in with `bunx eas-cli login`
- Apple Developer account access
- the target iPhone registered for internal distribution

Repo support:

- `apps/mobile/eas.json` contains a `development-device` profile for physical iOS devices
- `apps/mobile/package.json` contains:
    - `cd apps/mobile && bun run ios:eas-register-device`
    - `cd apps/mobile && bun run ios:eas-device`

Recommended flow:

1. Register the iPhone:

```bash
cd apps/mobile
bun run ios:eas-register-device
```

2. Make sure the build profile values are correct for your environment:

- `EXPO_PUBLIC_CONVEX_URL`
- `EXPO_PUBLIC_AGENTCHAT_SERVER_URL`

For a phone on the same LAN as this Linux host, the backend URL should look like:

- `http://<reachable-lan-host>:3030`

3. Start the remote build:

```bash
cd apps/mobile
bun run ios:eas-device
```

4. Install the build from the EAS link on the iPhone.

5. Start Metro for the development client:

```bash
cd apps/mobile
bun run dev-client
```

6. Open the installed development build on the phone and connect to Metro.

The repo's `dev-client` command should use LAN mode for physical-device testing so the generated connection target is reachable from the phone.

## Android Guidance

Android is the preferred target for repeatable native testing from Linux.

Manual options:

- physical Android device via `adb`
- Android emulator when available

Preflight the Linux Android path with:

```bash
bun run doctor:android
```

That command verifies:

- `adb` is installed
- at least one Android device is connected
- `apps/mobile/.env` points at a LAN-reachable backend URL instead of loopback
- the active mobile env still includes a Convex URL

For parity work, prefer the same runtime stack used by iPhone development builds:

- one LAN Metro dev-client session from `bun run --cwd apps/mobile dev-client`
- the same local `apps/server` backend on port `3030`
- the same active Convex deployment and local-auth users

That keeps Android and iOS testing on one backend-owned runtime path instead of splitting native validation across different startup modes.

Future automated Android tests should run only when:

- `adb` is installed
- at least one device or emulator is available
- any required Android SDK tooling is present

## iOS Guidance

iOS testing from Linux should remain intentionally limited to:

- manual physical-device checks using Expo Go when supported
- EAS development builds for reliable physical-device testing

Do not add commands that imply local iOS simulator or local Xcode support on Linux.

## Command Gating Rules

Platform-specific mobile commands should fail closed or skip cleanly when prerequisites are missing.

Examples:

- Android automation should only run when `adb` is installed and a device/emulator is available.
- Android emulator helpers should only run when the Android SDK and emulator tooling are installed.
- iOS simulator commands should only run on macOS with `xcrun simctl`.
- iOS manual-device helpers may be documented on Linux, but should not pretend to be automated.

## Testing Priorities

1. Web and server confidence first
2. Android mobile confidence on Linux
3. Manual iPhone checks via EAS development build
4. Expo Go on iPhone only when the current Expo Go release supports this repo's SDK
5. iOS simulator automation only on supported macOS hosts

## Current Rule

When adding mobile integration coverage:

- respect platform boundaries explicitly
- prefer Android-first automation on Linux
- keep iOS on Linux manual-only
- keep all mobile confidence work manually invoked unless a supported platform/toolchain is present
