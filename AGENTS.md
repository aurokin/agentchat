# Agentchat Agent Instructions

Read this file before making changes in this repository.

## Quick Reference

- Package manager: Bun. Use `bun install` and `bun run <script>`.
- Product name: Agentchat.
- Primary surfaces: `apps/web`, `apps/server`, `apps/mobile`, `packages/convex`, and `packages/shared`.
- Product source of truth: [docs/agentchat](docs/agentchat/README.md).
- Harness model: [Harness Engineering](docs/agentchat/harness-engineering.md).
- Git: avoid `git commit --no-verify` so hooks run.

## Harness Ladder

- Orient with [README.md](README.md), [docs/agentchat/README.md](docs/agentchat/README.md), and [Harness Engineering](docs/agentchat/harness-engineering.md).
- Prepare checkout state with `bun run bootstrap`, `bun run status`, `bun run doctor`, and `bun run config:print`.
- Use `bun run dev` only when a live stack is needed; stop it with `bun run stop`.
- Use `bun run worktree:create -- <name>` for disposable branch or runtime-isolation work.
- Run the health task for each modified surface: `bun run health:web`, `bun run health:server`, `bun run health:mobile`, `bun run health:shared`, or `bun run health:convex`.
- Use repo gates when touching contracts, env, docs, imports, or shared behavior: `bun run env:check`, `bun run docs:check`, `bun run lint:repo`, `bun run verify:ci`.

## Product Guardrails

- Build for the self-hosted, agent-centric architecture already in progress.
- Do not reintroduce hosted-product assumptions, billing, analytics, attachments, or browser-local product data modes.
- Treat Convex as the source of truth for auth, conversations, runs, and runtime bindings.
- Treat `apps/server` as the runtime layer. Codex is the active runtime. Pi, OpenCode, and Claude Code are planned.
- Runtime is an implementation detail of each agent, not a separate user-facing concept. See [Provider-Agent Merge Plan](plans/provider-agent-merge-plan.md) and [Roadmap](docs/agentchat/roadmap.md).

## Detailed References

- [Project Overview](docs/agents/overview.md)
- [Tooling And Tests](docs/agents/tooling.md)
- [Imports And Aliases](docs/agents/imports.md)
- [Workspace Rules](docs/agents/workspace.md)
- [Web App Notes](docs/agents/web.md)
- [Mobile Storage And Database](docs/agents/mobile-storage.md)
- [Mobile Features And UI Patterns](docs/agents/mobile-features.md)
- [Mobile Auth, Settings, And Onboarding](docs/agents/mobile-auth-settings.md)
