# Project Overview

## Snapshot

RouterChat is a monorepo with the primary app in `apps/web`.

- Framework: Next.js 16 App Router + React 19 + TypeScript
- Styling: Tailwind CSS 4 (plus `tailwind-merge`)
- Backend services: Convex (auth, sync, RevenueCat billing)
- Local persistence: IndexedDB + localStorage
- API: OpenRouter requests are made directly from the client

## Key Directories

- `apps/web`: Next.js app, UI, client logic
- `apps/mobile`: Expo app (React Native), uses Expo Router
- `packages/convex`: Convex backend (schema, auth, sync, billing, encryption)
- `src/lib/sync`: Storage adapters and sync state
- `src/lib/db.ts`, `src/lib/storage.ts`: IndexedDB/local storage helpers

## Documentation Expectations

- Major feature additions must be documented in `README.md`.
- Environment variable requirements must be listed in `README.md`.
- Use the product name `RouterChat` (not OpenRouter Chat).
