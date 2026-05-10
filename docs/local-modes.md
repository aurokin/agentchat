# Local Modes

This is the canonical local workflow doc for Agentchat.

Use it when you need to prepare a checkout for local work without colliding
with other checkouts on the same host.

## Model

Every checkout — main, feature worktree, or a long-lived production worktree
— is treated identically. URLs route through
[**portless**](https://github.com/vercel-labs/portless), worktrees are managed
with [**worktrunk**](https://github.com/max-sixty/worktrunk) (`wt`), and the
project-level `wt` post-start hook runs `wt step copy-ignored` to bring
`node_modules` and `.env.convex.local` over from the source worktree.

If you want a long-lived production-like instance pointed at a different
Convex deployment, just create a worktree (e.g. `wt switch -c stable`), edit
its `.env.convex.local`, and run `bun dev` (or `bun start` for next's
production runtime). There is no separate stable harness.

Tooling is installed via `mise` (already configured on your dev machine — see
the user mise config). On a clean machine you only need to run `portless trust`
once to add the local CA to the system trust store.

## URLs

portless owns hostname generation. Run `portless list` or
`portless get <name>` to see the current URLs:

- main checkout: `portless get agentchat-server` →
  `https://agentchat-server.<tld>`
- linked worktree on branch `feat`: `portless get agentchat-server` →
  `https://feat.agentchat-server.<tld>`

The TLD depends on your portless mode (`.localhost` by default,
`.local` in LAN/Bonjour mode). `*.localhost`, `*.agentchat.localhost`, and
`*.local` are all in `next.config.ts`'s `allowedDevOrigins`.

## Daily Dev

```bash
# main checkout, after a fresh clone
bun install
# put your Convex creds in .env.convex.local
# (see ./local_environment_setup_checklist.md)
bun dev                   # web + server + convex via portless

# new isolated worktree for a feature branch
wt switch -c feat-something
# (post-start hook copies node_modules + .env.convex.local from source via
#  `wt step copy-ignored` — that's it)
bun dev
# ... portless get agentchat-web for the URL ...
wt remove                 # standard worktrunk cleanup
```

`bun dev` is just a `concurrently` over each app's per-package `dev` script,
which itself runs the framework command through `portless run`. Mobile is
deliberately not in `bun dev` (see below).

## How Each App Gets Its Config

- **apps/server**: `package.json`'s dev/start scripts pass
  `--env-file=../../.env.convex.local --env-file=.env.local` to Bun. Shared
  values (CONVEX_URL, BACKEND_TOKEN_SECRET, RUNTIME_INGRESS_SECRET) come
  from the repo-root file; per-checkout overrides go in
  `apps/server/.env.local` (optional).
- **apps/web**: `next.config.ts` calls `process.loadEnvFile(...)` against
  the repo-root `.env.convex.local` at startup, then asks
  `portless get agentchat-server` for the server URL. Both are
  worktree-aware automatically.
- **apps/server/agentchat.config.json**: committed; uses `"."` for
  `agent.rootPath` and `runtime.cwd`. The schema resolves these against
  the config file's directory at load time, so the same file works in
  every worktree.

## Worktrunk Hook Layout

`.config/wt.toml` runs one hook:

- `post-start`: `wt step copy-ignored` copies all gitignored files (notably
  `node_modules/` and `.env.convex.local`) from the source checkout to the
  new worktree, so cold installs and Convex creds carry over without manual
  steps.

To point a worktree at a different Convex deployment, edit its
`.env.convex.local` and restart `bun dev`.

## Mobile / Expo

`apps/mobile` is intentionally **not** wrapped by portless. Portless's Expo
support is still rough (Metro + HTTPS proxy don't compose cleanly), so mobile
keeps its existing `expo start` flow:

```bash
bun --cwd apps/mobile dev
```

Connect the simulator/device to the worktree's portless server URL
(`portless get agentchat-server`). Re-evaluate this exclusion when portless
cuts a release with first-class Expo support.

## Agent Rules

1. `bun install` (only after a fresh clone or major dependency change)
2. `bun dev` when the task needs a live local web/server stack
3. Use `wt switch -c <branch>` to create a disposable worktree; `wt remove`
   to tear it down.

Agents should not hand-edit the committed `apps/server/agentchat.config.json`
to bake in absolute paths — the schema resolves `"."` at load time, which is
what every worktree wants.

## Related Docs

- [README](../README.md)
- [Local Environment Setup Checklist](./local_environment_setup_checklist.md)
