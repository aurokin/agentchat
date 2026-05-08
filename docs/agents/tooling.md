# Tooling And Tests

For the full confidence ladder, read [Harness Engineering](../agentchat/harness-engineering.md). This page is the command reference agents should use while working.

## Package Manager

- Use Bun for installs and scripts: `bun install`, `bun run <script>`.
- Use `bunx <package>` instead of `npx <package>`.

## Local Workflow

```bash
bun install
# populate <repo>/.env.convex.local once per checkout
bun dev                       # convex + apps/server + apps/web (server/web wrapped through portless)
```

Worktrees:

```bash
wt switch -c <branch>         # post-start runs `wt step copy-ignored`
wt list
wt remove
```

`bun --cwd apps/mobile dev` is run separately. Mobile is intentionally
**not** routed through portless until upstream Expo support is solid.

apps/server reads shared values directly from `<repo>/.env.convex.local`
via Bun's `--env-file`. apps/web's `next.config.ts` does the same and
asks `portless get agentchat-server` for the server URL. The committed
`apps/server/agentchat.config.json` uses `"."` for path fields and the
schema resolves them at load time.

Production-like instances are just worktrees with their own
`.env.convex.local`. Supervision (systemd, launchd, etc.) is operator-owned
and lives outside this repo.

## Convex CLI

- `CONVEX_DEPLOYMENT` for local Convex CLI/codegen should live in `packages/convex/.env.local`.
- Dev wrapper bootstrap refuses non-`dev:` Convex deployments.

## Health Checks

Always run the health task for each app you modify before finishing:

- Web: `bun run health:web`
- Server: `bun run health:server`
- Mobile: `bun run health:mobile`
- Shared: `bun run health:shared`
- Convex: `bun run health:convex`

`health` is read-only. It should verify formatting with `format:check` and must not rewrite files.

## Repo Verification

- `bun run lint:architecture` checks cross-surface import boundaries.
- `bun run env:check` verifies environment variables referenced in code are documented.
- `bun run docs:check` verifies docs point at real repo files and real Bun scripts.
- `bun run repo:knip` checks dependency and unlisted-dependency hygiene.
- `bun run type:suppressions` enforces the checked-in suppression baseline.
- `bun run lint:repo` runs the repo-policy verification tier.
- `bun run verify:ci` runs the cheap always-on CI tier.
- `bun run check:affected -- --base origin/main` runs the smallest reasonable verification set for the current working tree.

The health check output may log "Encryption is not configured" from Convex tests; this is expected.

## Tests

- Tests live in `__tests__` folders beside code.
- Run tests with `bun test`.
