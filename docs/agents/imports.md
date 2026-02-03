# Imports And Aliases

Prefer absolute imports when aliases are available.

## Web Aliases

- `@/*` -> `apps/web/src/*`
- `@/convex/*` -> `apps/web/convex/*`
- `@shared/*` -> `packages/shared/src/*`

## Mobile Aliases

- `@/*` -> `apps/mobile/src/*`
- `@shared/*` -> `packages/shared/src/*`

Keep alias definitions aligned across tsconfig, bundler (Next/Metro), and linting when enforced.
