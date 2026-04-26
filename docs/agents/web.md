# Web App Notes

Keep the chat shell mounted during background refreshes. After the first
bootstrap succeeds, auth/bootstrap refreshes must not route the page back
through the full-screen initial loader because that remounts the chat tree and
drops unsent input.

When modifying `packages/convex/convex/*`, run:

- `bun run --cwd packages/convex codegen`
