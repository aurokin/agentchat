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

1D) Sign in with an allowed Google account if the local workspace has auth enabled.

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
    - `AUTH_GOOGLE_ID=...` and `AUTH_GOOGLE_SECRET=...`
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

2H) Start local development (Convex + backend server + web):

```bash
bun run dev:web
```

2I) Manual step (only if needed): fix Google OAuth redirect URI.

- If sign-in fails with `Error 400: redirect_uri_mismatch`, add this Authorized redirect URI to the OAuth client matching `AUTH_GOOGLE_ID`:
    - `https://<your-deployment>.convex.site/api/auth/callback/google`

## 3) Optional: Local Mobile Development

Only do this if you want to exercise the current mobile app alongside the web/server stack.

3A) Prerequisites:

- Expo tooling
- Android Studio or a physical Android device
- Xcode for iOS simulator builds on macOS

3B) Create `apps/mobile/.env` from `apps/mobile/.env.example`.

Set:

- `EXPO_PUBLIC_CONVEX_URL=https://<your-deployment>.convex.cloud`
- `EXPO_PUBLIC_AGENTCHAT_SERVER_URL=http://<your-local-server-host>:8787`

3C) Start a mobile build:

```bash
cd apps/mobile && bun run android
```

or

```bash
cd apps/mobile && bun run ios
```

3D) For development client workflows:

```bash
cd apps/mobile && bun run dev-client
```

3E) Current expectation:

- Mobile follows the same backend-driven runtime model as web.
- Mobile is still catching up to web in a few UX and parity areas.
- Use `docs/agentchat/mobile-followup.md` for the remaining mobile work list.
