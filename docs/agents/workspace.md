# Workspace Rules

## Required Parity Rules

- Storage parity: if you change data models, CRUD logic, or storage keys, update:
    - `src/lib/workspace/convex-adapter.ts`
    - Convex schema, mutations, and queries in `packages/convex/convex/`
- Convex-first development: runtime behavior should assume Convex-backed storage.
- Cloud fallback: features should fail clearly when Convex is unavailable instead of silently inventing a local persistence mode.
- Settings parity: changes to stored defaults and theme settings must be reflected in both app shells.

## Workspace Notes

- Workspace availability is the only sync state that matters in the active app flow.
- Auth: Convex-managed access, moving toward Google or local Convex-backed users instead of a long-term shared default-user mode.
- Billing has been removed.
- Model requests and provider runtime execution now route through `apps/server`.
- Web browser storage is limited to UI preferences and selected agent/chat state.

## Shared Persistence Surface

`packages/shared/src/core/persistence/index.ts` now exists primarily to define the `PersistenceAdapter` interface plus the Convex-to-app mapping helpers used by web and mobile.
