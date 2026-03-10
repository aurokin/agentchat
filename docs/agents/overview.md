# Project Overview

## Snapshot

Agentchat is a monorepo with the primary app in `apps/web`.

- Framework: Next.js 16 App Router + React 19 + TypeScript
- Styling: Tailwind CSS 4 (plus `tailwind-merge`)
- Backend services: Convex (auth, synced data, encryption)
- Primary persistence: Convex
- API: OpenRouter requests are made directly from the client

## Key Directories

- `apps/web`: Next.js app, UI, client logic
- `apps/mobile`: Expo app (React Native), uses Expo Router
- `packages/convex`: Convex backend (schema, auth, sync, encryption)
- `src/lib/sync`: Storage adapters and sync state
- `src/lib/db.ts`, `src/lib/storage.ts`: Client storage helpers and legacy local persistence code

## Documentation Expectations

- Major feature additions must be documented in `README.md`.
- Environment variable requirements must be listed in `README.md`.
- Use the product name `Agentchat` (not OpenRouter Chat).
