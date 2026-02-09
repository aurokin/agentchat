# Local Development Setup

Goal: get RouterChat running locally for development.

RouterChat runs in **local-only** mode by default (no Cloud Sync, no Billing). If you need end-to-end Cloud Sync + Billing, use the preview runbook: `docs/preview_environment_setup_checklist.md`.

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

1D) In Settings, add your OpenRouter API key.

## 2) Optional: Local Dev With Cloud Sync (Convex)

Only do this if you need to develop Cloud Sync features locally. Otherwise, stick to Step 1.

2A) Manual step: create or choose a Convex dev deployment for local development.

Notes:

- The web app runs at `http://localhost:4040` in this repo.
- The app needs the Convex **client URL** (`*.convex.cloud`) at runtime.
- Convex Auth and HTTP actions use the Convex **site URL** (`*.convex.site`).

2B) Create a gitignored Convex runtime env file in the repo root:

- Copy `./.env.convex.dev.local.example` to `./.env.convex.dev.local`
- Fill in:
    - `CONVEX_DEPLOYMENT=dev:<your-deployment>`
    - `AUTH_GOOGLE_ID=...` and `AUTH_GOOGLE_SECRET=...`
    - `JWKS=...`, `JWT_PRIVATE_KEY=...`, `ENCRYPTION_KEY=...` (generate below)

2C) Generate Convex Auth + encryption secrets and paste them into `./.env.convex.dev.local`:

```bash
bun run convex:gen-secrets
```

2D) Apply the Convex runtime env vars to that dev deployment (safe to run repeatedly):

```bash
bun run convex:env -- --env dev
```

2E) Configure the Convex CLI target for local `convex dev` + codegen:

- Copy `packages/convex/.env.example` to `packages/convex/.env.local`
- Set:
    - `CONVEX_DEPLOYMENT=dev:<your-deployment>`

2F) Configure the local web app runtime to point at your Convex deployment:

- Copy `apps/web/.env.example` to `apps/web/.env.local`
- Set:
    - `NEXT_PUBLIC_CONVEX_URL=https://<your-deployment>.convex.cloud`

2G) Start local development (Convex + web):

```bash
bun run dev:web
```

2H) Manual step (only if needed): fix Google OAuth redirect URI.

- If sign-in fails with `Error 400: redirect_uri_mismatch`, add this Authorized redirect URI to the OAuth client matching `AUTH_GOOGLE_ID`:
    - `https://<your-deployment>.convex.site/api/auth/callback/google`

