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
- Pi, OpenCode, and Claude Code as planned runtime implementations.
- Provider-agent merge work tracked in [plans/provider-agent-merge-plan.md](plans/provider-agent-merge-plan.md).

The runtime is an implementation detail of an agent. Avoid rebuilding hosted
product assumptions, billing, analytics, attachments, or browser-local product
data modes into the active path.

## First Local Pass

Use the wrapper-owned harness before hand-editing checkout-local state:

```bash
bun install
bun run bootstrap
bun run status
bun run doctor
```

Start and stop the checkout-local stack with:

```bash
bun run dev
bun run stop
```

For disposable branch work:

```bash
bun run worktree:create -- <name>
cd ../<name>
```

Then run setup from the worktree checkout:

```bash
bun run bootstrap
bun run doctor
```

The wrapper owns generated local runtime files:

- `apps/web/.env.local`
- `apps/server/.env.local`
- `apps/server/agentchat.config.json`

Use `bun run bootstrap --adopt` only when intentionally folding manual edits
back into the wrapper manifest. Use `bun run bootstrap --force` only when
discarding generated drift.

## Harness Ladder

Use the lightest confidence layer that matches the change:

1. Orientation: read [AGENTS.md](AGENTS.md), this README, and [docs/agentchat/README.md](docs/agentchat/README.md).
2. Checkout readiness: `bun run bootstrap`, `bun run status`, `bun run doctor`, `bun run config:print`.
3. Runtime readiness: `bun run doctor:server`, then `bun run dev` when a live stack is needed.
4. Surface health: `bun run health:web`, `bun run health:server`, `bun run health:mobile`, `bun run health:shared`, or `bun run health:convex`.
5. Repo policy: `bun run env:check`, `bun run docs:check`, `bun run lint:repo`, and `bun run verify:ci`.
6. Live confidence: use the manual runtime and browser checks in [docs/agentchat/testing-plan.md](docs/agentchat/testing-plan.md).
7. Stable host: use [docs/agentchat/stable-host-runbook.md](docs/agentchat/stable-host-runbook.md) and `scripts/host/*.sh`.

The full model is documented in [docs/agentchat/harness-engineering.md](docs/agentchat/harness-engineering.md).

## Repo Surfaces

| Surface | Purpose |
| --- | --- |
| `apps/web` | Next.js web client |
| `apps/server` | Agent runtime server and live transport |
| `apps/mobile` | Expo mobile client |
| `packages/convex` | Convex schema, auth, conversations, runs, and runtime bindings |
| `packages/shared` | Shared contracts and utilities |
| `scripts/local` | Checkout-local wrapper harness |
| `scripts/host` | Protected stable host lifecycle |

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
