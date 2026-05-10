# Agentchat

Agentchat is a self-hosted agent chat harness. It keeps users, conversations,
runtime bindings, and local development state under operator control instead of
assuming a hosted product backend.

## Start Here

- Product and architecture map: [docs/agentchat/README.md](docs/agentchat/README.md)
- Harness engineering model: [docs/agentchat/harness-engineering.md](docs/agentchat/harness-engineering.md)
- Agent instructions: [AGENTS.md](AGENTS.md)
- Local wrapper details: [docs/local-modes.md](docs/local-modes.md)
- Operator setup: [docs/agentchat/operator-guide.md](docs/agentchat/operator-guide.md)
- Testing and confidence plan: [docs/agentchat/testing-plan.md](docs/agentchat/testing-plan.md)

## Current Shape

Agentchat is organized around the system that is already in progress:

- Agent-centric UX where conversations are bound to the selected agent.
- Convex-owned auth, conversations, runs, and runtime bindings.
- `apps/server` as the runtime layer that owns live agent sessions.
- Codex as the active runtime.
- Agent-owned inline runtime config for new Codex agents, with legacy provider
  config retained only as a compatibility bridge.
- Pi, OpenCode, and Claude Code as planned runtime implementations.

The runtime is an implementation detail of an agent. Avoid rebuilding hosted
product assumptions, billing, analytics, attachments, or browser-local product
data modes into the active path.

## First Local Pass

Web/server URLs are routed through [portless](https://github.com/vercel-labs/portless);
worktrees are managed with [worktrunk](https://github.com/max-sixty/worktrunk).
Both are installed via mise.

```bash
bun install
bun dev
```

Run `portless list` (or `portless get agentchat-web`) to see the URL —
portless prepends the worktree branch as a subdomain prefix automatically.

For disposable branch work:

```bash
wt switch -c <branch>     # post-start hook copies node_modules + .env.convex.local
bun dev
# ...
wt remove
```

apps/server reads `<repo>/.env.convex.local` directly via Bun's
`--env-file` (wired in `apps/server/package.json`'s dev/start scripts).
apps/web's `next.config.ts` loads the same file at startup and asks
`portless get agentchat-server` for the server URL. There's no
per-checkout codegen step.

## Harness Ladder

Use the lightest confidence layer that matches the change:

1. Orientation: read [AGENTS.md](AGENTS.md), this README, and [docs/agentchat/README.md](docs/agentchat/README.md).
2. Checkout readiness: `bun install`, populate `.env.convex.local` (one-time).
3. Runtime readiness: `bun run doctor:server`, then `bun dev` when a live stack is needed.
4. Surface health: `bun run health:web`, `bun run health:server`, `bun run health:mobile`, `bun run health:shared`, or `bun run health:convex`.
5. Repo policy: `bun run env:check`, `bun run docs:check`, `bun run lint:repo`, and `bun run verify:ci`.
6. Live confidence: use the manual runtime and browser checks in [docs/agentchat/testing-plan.md](docs/agentchat/testing-plan.md).

The full model is documented in [docs/agentchat/harness-engineering.md](docs/agentchat/harness-engineering.md).

## Repo Surfaces

| Surface           | Purpose                                                        |
| ----------------- | -------------------------------------------------------------- |
| `apps/web`        | Next.js web client                                             |
| `apps/server`     | Agent runtime server and live transport                        |
| `apps/mobile`     | Expo mobile client                                             |
| `packages/convex` | Convex schema, auth, conversations, runs, and runtime bindings |
| `packages/shared` | Shared contracts and utilities                                 |
| `scripts/local`   | Per-tree setup hook + supporting tests                         |

## Environment Inventory

This inventory keeps environment usage discoverable and satisfies the repo
environment-docs check. Prefer [docs/local-modes.md](docs/local-modes.md) and
[docs/agentchat/operator-guide.md](docs/agentchat/operator-guide.md) for setup
flow details.

Web runtime: `PORT`, `HOST`, `NEXT_PUBLIC_CONVEX_URL`,
`NEXT_PUBLIC_AGENTCHAT_SERVER_URL`, `NEXT_ALLOWED_DEV_ORIGINS`.

Mobile runtime: `EXPO_PUBLIC_CONVEX_URL`,
`EXPO_PUBLIC_AGENTCHAT_SERVER_URL`, `EXPO_PUBLIC_GOOGLE_CLIENT_ID`.

Convex CLI and backend: `CONVEX_DEPLOYMENT`, `CONVEX_URL`, `SITE_URL`,
`AGENTCHAT_AUTH_MODE`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`,
`BACKEND_TOKEN_SECRET`, `RUNTIME_INGRESS_SECRET`, `JWKS`, `JWT_PRIVATE_KEY`,
`CONVEX_SITE_URL`.

Agentchat backend server: `XDG_STATE_HOME`, `AGENTCHAT_CONVEX_SITE_URL`.

Optional Convex limits: `AGENTCHAT_MAX_CHAT_TITLE_CHARS`,
`AGENTCHAT_MAX_MESSAGE_CONTENT_CHARS`, `AGENTCHAT_MAX_MESSAGE_CONTEXT_CHARS`,
`AGENTCHAT_MAX_MESSAGE_REASONING_CHARS`, `AGENTCHAT_MAX_LOCAL_ID_CHARS`,
`AGENTCHAT_MAX_CHATS_PER_USER`, `AGENTCHAT_MAX_MESSAGES_PER_USER`,
`AGENTCHAT_MAX_LIST_CHATS`, `AGENTCHAT_MAX_LIST_MESSAGES`,
`AGENTCHAT_MAX_PAGE_CHATS`, `AGENTCHAT_MAX_PAGE_MESSAGES`.

Convex environment variable names must stay under 40 characters.

## License

MIT
