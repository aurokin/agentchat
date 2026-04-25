# Project Overview

## Snapshot

Agentchat is a monorepo with the primary product surfaces in `apps/web`, `apps/server`, `apps/mobile`, `packages/convex`, and `packages/shared`.

- Framework: Next.js 16 App Router + React 19 + TypeScript
- Server runtime: Bun + TypeScript in `apps/server`
- Styling: Tailwind CSS 4 (plus `tailwind-merge`)
- Backend services: Convex plus an instance-local backend server
- Primary persistence: Convex
- Runtime direction: agent-centric runtime architecture with Codex active first

The canonical architecture and product docs live in `docs/agentchat/`. The harness model lives in `docs/agentchat/harness-engineering.md`.

## Key Directories

- `apps/web`: Next.js app, web UI, chat runtime client
- `apps/server`: instance-local backend server for provider/runtime orchestration
- `apps/mobile`: Expo app (React Native), catching up to the web/server architecture
- `packages/convex`: Convex backend (schema, auth, workspace persistence)
- `packages/shared`: shared runtime, provider, persistence helpers, and unified theme palettes (`src/theme/`)
- `apps/web/src/lib/storage.ts`: browser UI preference storage for the web shell

## Documentation Expectations

- Keep `README.md` as the repo entry point, not the full operating manual.
- Environment variable names must remain discoverable in `README.md` because `bun run env:check` verifies them there.
- Use the product name `Agentchat` consistently.
- Product direction, rules, and roadmap belong under `docs/agentchat/`.
- If another doc conflicts with `docs/agentchat/`, treat `docs/agentchat/` as authoritative.
