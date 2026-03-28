# Local Environment Migration And Advanced Setup

Use [local-modes.md](./local-modes.md) first.

This document is now the migration and advanced-reference companion for the local wrapper workflow. It exists for cases where you need to understand the underlying Convex, auth, fixture, or mobile setup in more detail.

## Wrapper-First Baseline

Prepare the current checkout with:

```bash
bun install
bun run bootstrap
bun run status
bun run doctor
```

If you need a disposable worktree for parallel work, create it from the current checkout with:

```bash
bun run worktree:create -- <name>
```

This creates a sibling checkout under the repo parent directory. It refuses to run from a dirty source checkout unless you pass `--allow-dirty`, because uncommitted changes are not copied into git worktrees.

If you need a live local web/server stack for this checkout, use:

```bash
bun run dev
```

Then stop it with:

```bash
bun run stop
```

When the disposable worktree is no longer needed, remove it from the source checkout with:

```bash
bun run worktree:remove -- <name>
```

If you intentionally edit generated checkout-local files and want to keep those values:

```bash
bun run bootstrap --adopt
```

If you want to replace drifted generated files from the current manifest:

```bash
bun run bootstrap --force
```

## Host-Level Config

Recommended host layout:

- `~/.config/agentchat/config.json`
- `~/.config/agentchat/dev/convex.env`
- `~/.config/agentchat/stable/web.env`
- `~/.config/agentchat/stable/server.env`
- `~/.config/agentchat/stable/convex.env`
- `~/.config/agentchat/stable/server-config.json`
- `~/.config/agentchat/stable/convex-runtime.env`

Example host config:

- [agentchat-host-config.example.json](./examples/agentchat-host-config.example.json)

The wrapper currently uses the host-configured shared dev Convex env path during `bootstrap`. Stable host scripts now read the stable env and server-config files from this same host-level layout.

Stable Convex deployment secrets now have an operator workflow too:

```bash
scripts/host/generate-stable-convex-env.sh
scripts/host/apply-stable-convex-env.sh
scripts/host/smoke-stable.sh
scripts/host/install-stable-user-service.sh --enable-now
```

`generate-stable-convex-env.sh` creates or refreshes `~/.config/agentchat/stable/convex-runtime.env`, generates shared secrets when needed, and syncs the stable server/web host env files. `apply-stable-convex-env.sh` pushes that runtime env into the configured production Convex deployment.

The current stable host installation is expected to run from a dedicated checkout with:

- host-managed files under `~/.config/agentchat/stable/`
- lifecycle driven by `scripts/host/*.sh`
- LAN HTTPS served by local Caddy
- current LAN entrypoint `https://bront.home.arpa:4043`

## Manual Convex Setup

Do this only if you need a real local/dev Convex workspace.

1. Create or choose a dev Convex deployment.
2. Create `~/.config/agentchat/dev/convex.env`.
3. Set:
    - `CONVEX_DEPLOYMENT=dev:<your-deployment>`
4. Copy `.env.convex.local.example` to `.env.convex.local` only if you still need the legacy repo-root Convex helper flow.
5. Generate local Convex auth secrets if needed:

```bash
bun run convex:gen-secrets
```

6. Apply the Convex runtime env vars:

```bash
bun run convex:env
```

7. Copy `packages/convex/.env.example` to `packages/convex/.env.local` only if you need direct Convex CLI usage in this checkout.

8. Re-run wrapper bootstrap so the checkout-local web/server files pick up the current Convex values:

```bash
bun run bootstrap --adopt
```

## Dedicated Local Fixture Config

If you want the built-in low-token fixtures instead of the default current-checkout agent:

```bash
bun run setup:test-agent-config -- --force
bun run bootstrap --adopt
```

For local seeded users:

```bash
bun run setup:local-smoke-users
```

Or use the combined helper:

```bash
bun run setup:local-auth-smoke
bun run bootstrap --adopt
```

## Manual Runtime Validation

Before a deliberate manual confidence pass, validate the runtime surfaces:

```bash
bun run --cwd packages/convex codegen
bun run doctor:server
```

## Mobile

Mobile is not part of the first parallel-workflow wrapper slice.

If you need it anyway:

1. Create `apps/mobile/.env` from `apps/mobile/.env.example`.
2. Set:
    - `EXPO_PUBLIC_CONVEX_URL=https://<your-deployment>.convex.cloud`
    - `EXPO_PUBLIC_AGENTCHAT_SERVER_URL=http://<your-local-server-host>:3030`

Then use the existing mobile launchers directly.

## Google Redirect Note

If Google sign-in fails with `redirect_uri_mismatch`, add this redirect URI to the OAuth client that matches `AUTH_GOOGLE_ID`:

- `https://<your-deployment>.convex.site/api/auth/callback/google`
