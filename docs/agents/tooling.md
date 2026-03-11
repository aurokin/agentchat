# Tooling And Tests

## Package Manager

- Use Bun for scripts and installs: `bun install`, `bun run <script>`.
- Use `bunx <package>` instead of `npx <package>`.
- For mobile dependencies: `cd apps/mobile && bun install`.

## Convex CLI

- `CONVEX_DEPLOYMENT` for local Convex CLI/codegen should live in `packages/convex/.env.local`.

## Health Checks

Always run the health task for each app you modify before finishing:

- Web: `cd apps/web && bun run health`
- Server: `cd apps/server && bun run health`
- Mobile: `cd apps/mobile && bun run health`
- Shared: `cd packages/shared && bun run health`
- Convex: `cd packages/convex && bun run health`

From the repo root, the equivalent commands are:

- Web: `bun run health:web`
- Server: `bun run health:server`
- Mobile: `bun run health:mobile`
- Shared: `bun run health:shared`
- Convex: `bun run health:convex`

Env var docs:

- `bun run env:check` verifies environment variables referenced in code are documented (and that `.env.example` files stay in sync).
- `bun run health` from the repo root runs `env:check` first.

The health check output may log "Encryption is not configured" from Convex tests; this is expected.

## Tests

- Tests live in `__tests__` folders beside code.
- Run tests with `bun test`.
