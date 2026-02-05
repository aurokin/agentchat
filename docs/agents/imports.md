# Imports And Aliases

Prefer absolute imports when aliases are available.

## Web Aliases

- `@/*` -> `apps/web/src/*`
- `@shared/*` -> `packages/shared/src/*`
- `@convex/*` -> `packages/convex/convex/*`

## Mobile Aliases

- `@/*` -> `apps/mobile/src/*`
- `@shared/*` -> `packages/shared/src/*`
- `@convex/*` -> `packages/convex/convex/*`

Keep alias definitions aligned across tsconfig, bundler (Next/Metro), and linting when enforced.
