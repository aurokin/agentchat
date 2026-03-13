# Project Overview

## Snapshot

Agentchat is a monorepo with the primary app in `apps/web`.

- Framework: Next.js 16 App Router + React 19 + TypeScript
- Server runtime: Bun + TypeScript in `apps/server`
- Styling: Tailwind CSS 4 (plus `tailwind-merge`)
- Backend services: Convex today, with an instance-local backend server planned for the rewrite
- Primary persistence: Convex
- Runtime direction: agent-centric provider architecture with Codex first

The canonical rewrite docs live in `docs/agentchat/`.

## Key Directories

- `apps/web`: Next.js app, UI, client logic
- `apps/server`: instance-local backend server for agent/provider runtime orchestration
- `apps/mobile`: Expo app (React Native), uses Expo Router
- `packages/convex`: Convex backend (schema, auth, sync, encryption)
- `src/lib/sync`: Convex-backed sync helpers and workspace availability state
- `src/lib/storage.ts`: Browser UI preference storage for the web shell

## Documentation Expectations

- Major feature additions must be documented in `README.md`.
- Environment variable requirements must be listed in `README.md`.
- Use the product name `Agentchat` consistently.
- Product direction, rules, and roadmap for the rewrite belong under `docs/agentchat/`.
