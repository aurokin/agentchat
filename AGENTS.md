# Agent Instructions

- Read this file before making any changes in this repository.

# OpenRouter Chat Contributor Notes

## Project Snapshot

- Monorepo with the primary app in `apps/web`
- Framework: Next.js 16 App Router + React 19 + TypeScript
- Styling: Tailwind CSS 4 (plus `tailwind-merge`)
- Backend services: Convex (auth, sync, RevenueCat billing)
- Local persistence: IndexedDB + localStorage
- API: OpenRouter requests are made directly from the client

## Key Directories

- `apps/web`: Next.js app, UI, client logic
- `convex`: Cloud sync, auth, billing, encryption utilities
- `src/lib/sync`: Storage adapters and sync state
- `src/lib/db.ts`, `src/lib/storage.ts`: IndexedDB/local storage helpers

## Required Parity Rules

- **Storage parity**: If you change data models, CRUD logic, or storage keys, update BOTH adapters:
    - `src/lib/sync/local-adapter.ts`
    - `src/lib/sync/convex-adapter.ts`
    - Convex schema/mutations/queries in `convex/`
- **Sync migrations**: When adding new synced fields, update the `initialSync` migration logic so local data copies to cloud on first enable.
- **Local-first support**: Every feature must work in `local-only` mode unless it is explicitly cloud-only.
- **Cloud fallback**: Cloud features must degrade gracefully when Convex is unavailable.
- **Settings parity**: Changes to local settings or API key storage must be mirrored in Convex sync and `src/hooks/useApiKey.ts`.

## Cloud Sync Notes

- Sync states: `local-only`, `cloud-enabled`, `cloud-disabled`
- Auth: Google OAuth via Convex Auth; Pro subscription unlocks cloud mode
- RevenueCat is the source of truth for entitlements; web billing uses purchase links, Stripe is processor-only, and entitlement metadata lives in Convex
- Subscription management should use the RevenueCat customer portal API, not the purchase link
- API key encryption lives in `convex/lib/encryption.ts` and `src/hooks/useApiKey.ts`
- `ENCRYPTION_KEY` is required in Convex for API key sync
- Update `cloneCloudToLocal` when Convex data expands

## Tooling Expectations

- Use Bun for scripts and installs (`bun install`, `bun dev`, `bun run <script>`)
- Use `bunx <package>` instead of `npx <package>`
- Run the health check before finishing: `cd apps/web && bun run health`
- Tests live in `__tests__` folders beside code; use `bun test`
- The health check test output logs "Encryption is not configured" from Convex tests; this is expected.

## Documentation Expectations

- Major feature additions must be documented in `README.md`
- Environment variable requirements must be listed in `README.md`
- Use the product name `RouterChat` (not OpenRouter Chat)
