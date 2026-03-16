# Workspace Rules

## Required Parity Rules

- Storage parity: if you change data models, CRUD logic, or storage keys, update:
    - `src/lib/workspace/convex-adapter.ts`
    - Convex schema, mutations, and queries in `packages/convex/convex/`
- Convex-first development: runtime behavior should assume Convex-backed storage.
- Cloud fallback: features should fail clearly when Convex is unavailable instead of silently inventing a local persistence mode.
- Settings parity: changes to stored defaults and theme settings must be reflected in both app shells.
- Theme parity: color tokens live in `packages/shared/src/theme/` (`light.ts`, `dark.ts`, `types.ts`). Never define color values directly in `globals.css` or `ThemeContext.tsx` — edit the shared palettes and both platforms pick them up. Web-only extension tokens (e.g. `--secondary`, `--accent`) are in `apps/web/src/lib/theme-css.ts`. When adding a new color, add it to `ThemeColors`, both palettes, and `css-mapping.ts`, then register the CSS variable in the `@theme` block in `globals.css` so Tailwind can use it.

## Workspace Notes

- Workspace availability is the only sync state that matters in the active app flow.
- Auth: Convex-managed access, moving toward Google or local Convex-backed users instead of a long-term shared default-user mode.
- Billing has been removed.
- Model requests and provider runtime execution now route through `apps/server`.
- Web browser storage is limited to UI preferences and selected agent/chat state.

## Shared Persistence Surface

`packages/shared/src/core/persistence/index.ts` now exists primarily to define the `PersistenceAdapter` interface plus the Convex-to-app mapping helpers used by web and mobile.
