# Harness Engineering

Agentchat treats documentation, wrapper scripts, generated config, tests, and
Linear planning as one harness. The goal is to make each layer of confidence
explicit, scoped, and cheap enough to run at the right time.

## Principles

- Start from the source docs: [AGENTS.md](../../AGENTS.md), [README.md](../../README.md), and [Agentchat Architecture And Direction](./README.md).
- Let `scripts/local/setup-tree.ts` own checkout-local generated state.
- Isolate branch work in worktrunk-managed worktrees before runtime-heavy changes.
- Treat Convex as the durable source of truth for auth, conversations, runs, and runtime bindings.
- Treat `apps/server` as the runtime layer; clients should observe and command through defined APIs.
- Use deterministic fixtures before live Codex or browser confidence passes.
- Keep manual confidence checks explicit instead of quietly turning them into always-on automation.
- Put sequencing and blockers in Linear; keep repo docs focused on durable contracts and operating rules.

## Progressive Harness

### 1. Orientation

Read the smallest entry point that matches the work:

- Agent-facing rules: [AGENTS.md](../../AGENTS.md)
- Human-facing repo entry: [README.md](../../README.md)
- Product and architecture map: [Agentchat Architecture And Direction](./README.md)
- Implementation conventions: [docs/agents](../agents/overview.md)

### 2. Checkout Harness

Use these before changing generated config:

```bash
bun install
bun scripts/local/setup-tree.ts
```

`setup-tree.ts` writes checkout-local env files and `apps/server/agentchat.config.json`. It
sources Convex creds from `~/.config/agentchat/convex.env`. In a `wt`-managed
worktree it runs automatically as the post-start hook.

### 3. Worktree Harness

Use [worktrunk](https://github.com/max-sixty/worktrunk) for branch reconciliation,
runtime isolation, and parallel agent work:

```bash
wt switch -c <branch>     # creates worktree + branch, runs setup-tree.ts via post-start hook
wt list                   # show worktrees
wt remove                 # remove the current worktree (or named worktree)
```

The post-remove hook drops `~/.local/state/agentchat-trees/<branch>/` so per-tree state stays
clean.

### 4. Runtime Harness

Use server readiness checks before live runtime testing:

```bash
bun run doctor:server
bun dev                   # convex + server + web (server/web wrapped through portless)
```

URLs come from portless: `https://agentchat-web.agentchat.localhost` and
`https://agentchat-server.agentchat.localhost` (with `<branch>.` prefix in
linked worktrees).

`apps/server` owns live runtime sessions. Codex is the active runtime. Pi,
OpenCode, and Claude Code are planned implementations behind the agent-centric
runtime model.

### 5. Surface Health

Run the health task for each modified surface:

- Web: `bun run health:web`
- Server: `bun run health:server`
- Mobile: `bun run health:mobile`
- Shared: `bun run health:shared`
- Convex: `bun run health:convex`

Health tasks are read-only and should not rewrite files.

### 6. Repo Policy

Use repo policy checks when changing contracts, docs, env, imports, or shared
behavior:

```bash
bun run env:check
bun run docs:check
bun run lint:repo
bun run verify:ci
```

For scoped implementation work, prefer:

```bash
bun run check:affected -- --base origin/main
```

### 7. Live Confidence

Manual confidence is deliberate and expensive. Use it when a change touches live
runtime behavior, streaming, interruption, multi-client behavior, or browser
workflows.

Primary references:

- [Testing Plan](./testing-plan.md)
- [Manual QA Checklist](./manual-qa-checklist.md)
- [Operator Guide](./operator-guide.md)

Common commands:

```bash
bun run setup:test-agent-config
bun run test:manual:codex-confidence
bun run test:manual:live-runtime-smoke
bun run test:manual:live-runtime-interrupt
bun run test:manual:runtime-confidence
```

### 8. Planning Harness

Linear now owns the active reconciliation and runtime-foundation work breakdown.
Repo docs should capture durable product, architecture, harness, and operating
contracts. Do not duplicate issue-level task lists here unless the doc is a
stable reference that future work should continue to obey.
