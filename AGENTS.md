# Agentchat Agent Instructions

Read this file before making any changes in this repository.

## Quick Reference

- Package manager: Bun.
- Health checks: run for each app you modify (see Tooling).
- Product name: Agentchat.
- Primary implementation surfaces: `apps/web`, `apps/server`, and `packages/convex`.
- Source of truth for product direction: `docs/agentchat/`.
- Git: avoid `git commit --no-verify` so hooks run.

## Detailed Instructions

- [Project Overview](docs/agents/overview.md)
- [Product Direction And Roadmap](docs/agentchat/README.md)
- [Tooling And Tests](docs/agents/tooling.md)
- [Imports And Aliases](docs/agents/imports.md)
- [Workspace Rules](docs/agents/workspace.md)
- [Web App Notes](docs/agents/web.md)
- [Mobile Storage And Database](docs/agents/mobile-storage.md)
- [Mobile Features And UI Patterns](docs/agents/mobile-features.md)
- [Mobile Auth, Settings, And Onboarding](docs/agents/mobile-auth-settings.md)

## Current Product Guardrails

- Build for the self-hosted, agent-centric architecture that is already in progress.
- Do not reintroduce hosted-product assumptions, billing, analytics, attachments, or browser-local data modes.
- Treat Convex as the current source of truth for auth, conversations, runs, and runtime bindings.
- Treat `apps/server` as the provider/runtime layer, with Codex as the only active provider target in this phase. Do not spend implementation effort on additional providers until Codex is highly confident end to end.
