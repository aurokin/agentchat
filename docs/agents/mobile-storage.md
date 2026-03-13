# Mobile Storage

The mobile app is now Convex-first. Do not add new SQLite, file-system, or local attachment storage paths for product data.

## Active Storage

- `expo-secure-store` stores auth tokens, onboarding state, theme, selected agent, selected chat, and per-agent default provider/model/variant preferences.
- Convex is the authoritative backend for chats, messages, runs, and runtime recovery state.
- Mobile runtime code reads and writes through the Convex-backed storage adapter in `apps/mobile/src/lib/sync/convex-adapter.ts`.

## What To Use

- Use `src/lib/storage/credential-storage.ts` for auth credentials.
- Use `src/lib/storage/user-settings-storage.ts` for selected agent/chat and per-agent defaults.
- Use `src/lib/storage/sync-storage.ts` only for theme and onboarding persistence.
- Use `src/contexts/SyncContext.tsx` and the shared `StorageAdapter` interface for chat/message persistence.

## What To Avoid

- Do not add new imports from `src/lib/db/*`.
- Do not reintroduce `expo-sqlite`, file-based attachment storage, or migration helpers as part of normal feature work.
- Do not treat mobile as local-first. Signed-in users operate against the Convex-backed workspace.

## Current Model

- Conversations are scoped to the selected agent.
- Provider, model, and variant defaults can be stored per agent in SecureStore.
- Active run state is recovered from Convex-backed run summaries plus websocket state.

## Related Files

- `apps/mobile/src/contexts/SyncContext.tsx`
- `apps/mobile/src/lib/sync/convex-adapter.ts`
- `apps/mobile/src/lib/storage/credential-storage.ts`
- `apps/mobile/src/lib/storage/sync-storage.ts`
- `apps/mobile/src/lib/storage/user-settings-storage.ts`
