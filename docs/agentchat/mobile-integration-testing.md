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
- Expo Go on physical iOS devices over LAN or tunnel
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
3. Use Expo Go on iOS for the fastest manual smoke path when possible.
4. Reserve iOS simulator automation for a future macOS runner or developer machine.

## Expo Go Guidance

The current mobile app is a plausible Expo Go target for iOS manual testing because the active dependency surface is still Expo-managed and the only custom config plugin in this repo is Android-specific.

Current caveats:

- Expo Go is a manual-device path, not an automation path.
- Android share-intent behavior depends on the custom Android plugin and should not be treated as validated in Expo Go.
- If native requirements expand later, Expo Go support may stop being sufficient; document that change when it happens.

## Fast Manual iPhone Path

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

## Android Guidance

Android is the preferred target for repeatable native testing from Linux.

Manual options:

- physical Android device via `adb`
- Android emulator when available

Future automated Android tests should run only when:

- `adb` is installed
- at least one device or emulator is available
- any required Android SDK tooling is present

## iOS Guidance

iOS testing from Linux should remain intentionally limited to:

- manual physical-device checks using Expo Go
- remote build workflows if a signed native build becomes necessary

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
3. Manual iPhone checks via Expo Go
4. iOS simulator automation only on supported macOS hosts

## Current Rule

When adding mobile integration coverage:

- respect platform boundaries explicitly
- prefer Android-first automation on Linux
- keep iOS on Linux manual-only
- keep all mobile confidence work manually invoked unless a supported platform/toolchain is present
