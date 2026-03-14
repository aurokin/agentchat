# Local Development Setup

Goal: get Agentchat running locally for development.

Agentchat runs against Convex plus a local Agentchat backend server.

## 1) Local-Only (Fast Path)

1A) Install dependencies:

```bash
bun install
```

1B) Start the web dev server:

```bash
cd apps/web && bun dev
```

1C) Open the app:

- `http://localhost:4040`

1D) If the local workspace uses `AGENTCHAT_AUTH_MODE=google`, sign in with an allowed Google account. If it uses `local`, sign in with a seeded local user such as `smoke_1`. If it uses `disabled`, the app will initialize the default workspace user automatically.

## 2) Optional: Local Dev With Convex

Only do this if you need to develop against a real Convex workspace. Otherwise, stick to Step 1.

2A) Manual step: create or choose a Convex dev deployment for local development.

Notes:

- The web app runs at `http://localhost:4040` in this repo.
- The app needs the Convex **client URL** (`*.convex.cloud`) at runtime.
- Convex Auth and HTTP actions use the Convex **site URL** (`*.convex.site`).

2B) Create a gitignored Convex runtime env file in the repo root:

- Copy `./.env.convex.local.example` to `./.env.convex.local`
- Fill in:
    - `CONVEX_DEPLOYMENT=dev:<your-deployment>`
    - `AGENTCHAT_AUTH_MODE=google` or `AGENTCHAT_AUTH_MODE=disabled`
    - `AUTH_GOOGLE_ID=...` and `AUTH_GOOGLE_SECRET=...` only if auth mode is `google`
    - `JWKS=...`, `JWT_PRIVATE_KEY=...`
    - `BACKEND_TOKEN_SECRET=...`
    - `RUNTIME_INGRESS_SECRET=...`

2C) Generate Convex Auth secrets and paste them into `./.env.convex.local`:

```bash
bun run convex:gen-secrets
```

2D) Apply the Convex runtime env vars to that dev deployment (safe to run repeatedly):

```bash
bun run convex:env
```

2E) Configure the Convex CLI target for local `convex dev` + codegen:

- Copy `packages/convex/.env.example` to `packages/convex/.env.local`
- Set:
    - `CONVEX_DEPLOYMENT=dev:<your-deployment>`

2F) Configure the local web app runtime to point at your Convex workspace:

- Copy `apps/web/.env.example` to `apps/web/.env.local`
- Set:
    - `NEXT_PUBLIC_CONVEX_URL=https://<your-deployment>.convex.cloud`

2G) Configure the local Agentchat backend server runtime:

- Copy `apps/server/.env.example` to `apps/server/.env.local`
- Set:
    - `BACKEND_TOKEN_SECRET=<same value you set in Convex>`
    - `AGENTCHAT_CONVEX_SITE_URL=https://<your-deployment>.convex.site`
    - `RUNTIME_INGRESS_SECRET=<same value you set in Convex>`

Optional shortcut for the dedicated local test fixtures:

```bash
bun run setup:test-agent-config
```

This writes `apps/server/agentchat.config.json` pointing at:

- `~/agents/agentchat_test/smoke`
- `~/agents/agentchat_test`
- `~/agents/agentchat_test/workspace`

By default, this generated config uses a disabled auth provider as a transitional local path so integration and manual runtime checks do not require sign-in.

If you want the local seeded-user path instead:

```bash
bun run setup:test-agent-config -- --auth-mode=local --force
bun run setup:local-smoke-users
```

Re-run with `--force` only if you want to replace an existing local config:

```bash
bun run setup:test-agent-config -- --force
```

2H) Start local development (Convex + backend server + web):

```bash
bun run dev:web
```

2I) Validate the configured agents, provider runtime paths, and live Codex model access before a manual confidence pass:

```bash
bun run --cwd packages/convex codegen
bun run doctor:server
```

`bun run doctor:server` now also reports whether the local `apps/server` runtime has the required env values for backend token verification and Convex runtime persistence.

2J) Manual step (only if needed and only when auth mode is `google`): fix Google OAuth redirect URI.

- If sign-in fails with `Error 400: redirect_uri_mismatch`, add this Authorized redirect URI to the OAuth client matching `AUTH_GOOGLE_ID`:
    - `https://<your-deployment>.convex.site/api/auth/callback/google`

## 3) Optional: Local Mobile Development

Only do this if you want to exercise the current mobile app alongside the web/server stack.

3A) Prerequisites:

- Expo tooling
- Android Studio or a physical Android device
- Xcode only if you are on macOS and need iOS simulator or local native iOS builds

3B) Create `apps/mobile/.env` from `apps/mobile/.env.example`.

Set:

- `EXPO_PUBLIC_CONVEX_URL=https://<your-deployment>.convex.cloud`
- `EXPO_PUBLIC_AGENTCHAT_SERVER_URL=http://<your-local-server-host>:3030`

3C) Best-effort iPhone path from Linux: Expo Go over LAN.

```bash
bun run dev:mobile:expo-go
```

Then scan the QR code in Expo Go on the iPhone.

Use a reachable LAN host for `EXPO_PUBLIC_AGENTCHAT_SERVER_URL`; do not leave it at `localhost` when testing from another device.

If Expo Go reports that the project is incompatible with the installed Expo Go release, switch to an EAS development build instead:

```bash
cd apps/mobile && bun run ios:eas-register-device
cd apps/mobile && bun run ios:eas-device
```

Then start Metro for the installed development build:

```bash
cd apps/mobile && bun run dev-client
```

This now starts the Expo development client in LAN mode so a physical iPhone can reach Metro directly.

3D) Start a native mobile build:

```bash
cd apps/mobile && bun run android
```

or

```bash
cd apps/mobile && bun run ios
```

3E) For development client workflows:

```bash
cd apps/mobile && bun run dev-client
```

3F) Current expectation:

- Mobile follows the same backend-driven runtime model as web.
- Mobile is still catching up to web in a few UX and parity areas.
- Use `docs/agentchat/mobile-followup.md` for the remaining mobile work list.
- Use `docs/agentchat/mobile-integration-testing.md` for the supported-platform testing boundaries.
