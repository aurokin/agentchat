# Harness Engineering

Agentchat treats documentation, wrapper scripts, generated config, tests, and
Linear planning as one harness. The goal is to make each layer of confidence
explicit, scoped, and cheap enough to run at the right time.

## Principles

- Start from the source docs: [AGENTS.md](../../AGENTS.md), [README.md](../../README.md), and [Agentchat Architecture And Direction](./README.md).
- Let wrapper commands own checkout-local generated state.
- Isolate branch work in wrapper-created git worktrees before runtime-heavy changes.
- Keep the protected stable host separate from disposable worktrees.
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
bun run bootstrap
bun run status
bun run doctor
bun run config:print
```

`bootstrap` writes checkout-local env and server config. `status` shows wrapper
state. `doctor` fails fast on incomplete Convex, secret, or runtime setup.

### 3. Worktree Harness

Use wrapper-created sibling worktrees for branch reconciliation, runtime
isolation, and parallel agent work:

```bash
bun run worktree:create -- <name>
bun run worktree:remove -- <name>
bun run worktree:gc
```

The wrapper intentionally refuses dirty source checkouts by default because git
worktrees start from committed refs, not uncommitted local edits.

### 4. Runtime Harness

Use server readiness checks before live runtime testing:

```bash
bun run doctor:server
bun run dev
bun run stop
```

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
runtime behavior, streaming, interruption, multi-client behavior, browser
workflows, or stable-host operation.

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

### 8. Stable Host Harness

The stable host is operator-owned and protected from disposable checkout state.
Use it only for work about the protected host install:

- [Stable Host Runbook](./stable-host-runbook.md)
- [Local Modes](../local-modes.md)
- `scripts/host/*.sh`

### 9. Planning Harness

Linear now owns the active reconciliation and runtime-foundation work breakdown.
Repo docs should capture durable product, architecture, harness, and operating
contracts. Do not duplicate issue-level task lists here unless the doc is a
stable reference that future work should continue to obey.
