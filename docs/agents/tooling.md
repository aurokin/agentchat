# Tooling And Tests

## Package Manager

- Use Bun for scripts and installs: `bun install`, `bun run <script>`.
- Use `bunx <package>` instead of `npx <package>`.
- For mobile dependencies: `cd apps/mobile && bun install`.

## Health Checks

Always run the health task for each app you modify before finishing:

- Web: `cd apps/web && bun run health`
- Mobile: `cd apps/mobile && bun run health`
- Shared: `cd packages/shared && bun run health`

The health check output may log "Encryption is not configured" from Convex tests; this is expected.

## Tests

- Tests live in `__tests__` folders beside code.
- Run tests with `bun test`.
