# Project Overview

## Snapshot

Agentchat is a monorepo with the primary product surfaces in `apps/web`, `apps/server`, and `packages/convex`.

- Framework: Next.js 16 App Router + React 19 + TypeScript
- Server runtime: Bun + TypeScript in `apps/server`
- Styling: Tailwind CSS 4 (plus `tailwind-merge`)
- Backend services: Convex plus an instance-local backend server
- Primary persistence: Convex
- Runtime direction: agent-centric provider architecture with Codex first

The canonical rewrite docs live in `docs/agentchat/`.

## Key Directories

- `apps/web`: Next.js app, web UI, chat runtime client
- `apps/server`: instance-local backend server for provider/runtime orchestration
- `apps/mobile`: Expo app (React Native), catching up to the web/server architecture
- `packages/convex`: Convex backend (schema, auth, workspace persistence)
- `packages/shared`: shared runtime, provider, and persistence helpers
- `apps/web/src/lib/storage.ts`: browser UI preference storage for the web shell

## Documentation Expectations

- Major feature additions must be documented in `README.md`.
- Environment variable requirements must be listed in `README.md`.
- Use the product name `Agentchat` consistently.
- Product direction, rules, and roadmap for the rewrite belong under `docs/agentchat/`.
- If another doc conflicts with `docs/agentchat/`, treat `docs/agentchat/` as authoritative.
