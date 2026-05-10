# Local Environment Setup

Use [local-modes.md](./local-modes.md) first for the canonical workflow. This
document covers one-time host setup and Convex wiring.

## One-Time Setup

Tooling (`bun`, `worktrunk`, `portless`) is installed via mise. After cloning
the repo on a new machine:

```bash
mise install                    # picks up the user mise config
portless trust                  # adds local CA to system trust store (one-time, prompts for sudo)
```

Drop your Convex deployment creds into a repo-local dotenv at
`<repo>/.env.convex.local`:

```bash
cp .env.convex.local.example .env.convex.local
# edit .env.convex.local and set CONVEX_DEPLOYMENT, CONVEX_URL, etc.
bun run convex:gen-secrets >> .env.convex.local   # mints shared + auth secrets
bun run convex:env                                # pushes them to Convex
```

`<repo>/.env.convex.local` is the single source of truth for shared values.
`bun run convex:env` pushes them to the Convex deployment;
`apps/server/package.json`'s dev/start scripts pass `--env-file=../../.env.convex.local`
to Bun so the server reads the same values directly;
`apps/web/next.config.ts` loads the file at startup (and asks
`portless get agentchat-server` for the server URL). The file is gitignored
(`.env*.local`) and propagated into new worktrees by `wt step copy-ignored`,
which is what `.config/wt.toml`'s `post-start` hook runs.

## Daily Flow

```bash
bun install
bun dev
```

For a disposable worktree:

```bash
wt switch -c <branch>     # post-start hook copies node_modules + .env.convex.local
bun dev
# ...
wt remove                 # standard worktrunk cleanup
```

`bun dev` runs Convex + apps/server + apps/web concurrently, with web and
server wrapped through `portless run`. portless owns hostname generation —
run `portless list` or `portless get <name>` to see the current URLs (they
include the worktree branch as a subdomain prefix automatically).

## Long-Lived / Production-Like Instance

There is no separate "stable" harness. To run a production-like instance
pointed at a different Convex deployment:

```bash
wt switch -c stable                # name doesn't matter — any branch
# inside the worktree:
$EDITOR .env.convex.local          # point at your prod Convex deployment
bun run --cwd apps/web build       # if you want next's production runtime
bun --cwd apps/web start &         # or `bun dev` for the dev runtime
bun --cwd apps/server start &
```

Wrap with whatever supervisor (systemd, launchd, tmux) the host uses. The repo
no longer ships a service-unit template.

## Manual Convex Setup

If you need to wire up a fresh Convex deployment:

```bash
bun run --cwd packages/convex codegen
# Set CONVEX_DEPLOYMENT / CONVEX_URL / auth in .env.convex.local first, then:
bun run convex:gen-secrets >> .env.convex.local
bun run convex:env -- --deployment dev:<your-deployment>
```

`convex:gen-secrets` emits Convex Auth keys (`JWKS`, `JWT_PRIVATE_KEY`,
`ENCRYPTION_KEY`) and the shared ingress secrets (`RUNTIME_INGRESS_SECRET`,
`BACKEND_TOKEN_SECRET`). All five live in `.env.convex.local`; `convex:env`
pushes them to Convex; apps/server reads them at boot via
`bun --env-file=../../.env.convex.local`.

### Migrating a pre-AUR-184 checkout

If your `apps/server/.env.local` already has live `RUNTIME_INGRESS_SECRET` /
`BACKEND_TOKEN_SECRET` values that Convex doesn't know about, copy them into
the shared file without rotating:

```bash
bun run env:sync-secrets   # appends missing keys to .env.convex.local
bun run convex:env         # pushes them to Convex
```

## Dedicated Local Fixture Config

For the built-in low-token fixtures instead of the default current-checkout
agent:

```bash
bun run setup:test-agent-config -- --force
```

For seeded local users:

```bash
bun run setup:local-smoke-users
bun run setup:local-auth-smoke
```

## Mobile

Mobile is intentionally outside portless. See
[local-modes.md](./local-modes.md#mobile--expo).

```bash
bun --cwd apps/mobile dev
```

Run `portless get agentchat-server` from the worktree where the server is
running to get the right hostname (it'll include the worktree's branch as
a subdomain prefix when applicable). dotenv does not execute shell
substitution, so paste the resolved URL into `apps/mobile/.env`:

```
EXPO_PUBLIC_CONVEX_URL=https://<deployment>.convex.cloud
EXPO_PUBLIC_AGENTCHAT_SERVER_URL=https://<branch>.agentchat-server.example.com
```

## Google Redirect

If Google sign-in fails with `redirect_uri_mismatch`, add this redirect URI to
the OAuth client that matches `AUTH_GOOGLE_ID`:

`https://<your-deployment>.convex.site/api/auth/callback/google`
