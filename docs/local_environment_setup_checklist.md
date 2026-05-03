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
```

`scripts/local/setup-tree.ts` reads that file and copies the relevant keys
into the per-tree `apps/server/.env.local` and `apps/web/.env.local`.
`.env.convex.local` is gitignored (`.env*.local` rule) and is propagated into
new worktrees by `wt step copy-ignored`, which the post-start hook runs.

## Daily Flow

```bash
bun install
bun scripts/local/setup-tree.ts        # main checkout: run once after clone
bun dev
```

For a disposable worktree:

```bash
wt switch -c <branch>                  # post-start hook copies node_modules + .env.convex.local, then runs setup-tree.ts
bun dev
# ...
wt remove                              # post-remove hook drops ~/.local/state/agentchat-trees/<branch>/
```

`bun dev` runs Convex + apps/server + apps/web concurrently, with web and
server wrapped through `portless run`. URLs:

- main: `https://agentchat-web.agentchat.localhost`,
  `https://agentchat-server.agentchat.localhost`
- worktree: `https://<branch>.agentchat-web.agentchat.localhost`,
  `https://<branch>.agentchat-server.agentchat.localhost`

## Long-Lived / Production-Like Instance

There is no separate "stable" harness. To run a production-like instance
pointed at a different Convex deployment:

```bash
wt switch -c stable                    # name doesn't matter — any branch
# inside the worktree:
$EDITOR .env.convex.local              # point at your prod Convex deployment
bun scripts/local/setup-tree.ts        # regenerate apps/{web,server}/.env.local
bun run --cwd apps/web build           # if you want next's production runtime
bun --cwd apps/web start &             # or `bun dev` for the dev runtime
bun --cwd apps/server start &
```

Wrap with whatever supervisor (systemd, launchd, tmux) the host uses. The repo
no longer ships a service-unit template.

## Manual Convex Setup

If you need to wire up a fresh Convex deployment:

```bash
bun run --cwd packages/convex codegen
bun run convex:gen-secrets > /tmp/secrets.env
bun run convex:env -- --deployment dev:<your-deployment> < /tmp/secrets.env
```

Then update `<repo>/.env.convex.local` with the new
`CONVEX_DEPLOYMENT` / `CONVEX_URL` and re-run `setup-tree.ts` in each active
worktree.

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

Set `apps/mobile/.env`:

```
EXPO_PUBLIC_CONVEX_URL=https://<deployment>.convex.cloud
EXPO_PUBLIC_AGENTCHAT_SERVER_URL=https://<branch>.agentchat-server.agentchat.localhost
```

(Or use the bare `https://agentchat-server.agentchat.localhost` URL when
running the mobile client against the main checkout.)

## Google Redirect

If Google sign-in fails with `redirect_uri_mismatch`, add this redirect URI to
the OAuth client that matches `AUTH_GOOGLE_ID`:

`https://<your-deployment>.convex.site/api/auth/callback/google`
