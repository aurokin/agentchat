# Local Modes

This is the canonical local workflow doc for Agentchat.

Use it when you need to prepare a checkout for local work without colliding
with other checkouts on the same host.

## Model

Every checkout — main, feature worktree, or a long-lived production worktree
— is treated identically. URLs route through
[**portless**](https://github.com/vercel-labs/portless), worktrees are managed
with [**worktrunk**](https://github.com/max-sixty/worktrunk) (`wt`), and a
project-level `wt` post-start hook runs `scripts/local/setup-tree.ts` to wire
up per-tree env files.

If you want a long-lived production-like instance pointed at a different
Convex deployment, just create a worktree (e.g. `wt switch -c stable`), edit
its `.env.convex.local`, and run `bun dev` (or `bun start` if you want next's
production runtime). There is no separate stable harness.

Tooling is installed via `mise` (already configured on your dev machine — see
the user mise config). On a clean machine you only need to run `portless trust`
once to add the local CA to the system trust store.

## URLs

Auto-derived by portless from `package.json`:

- main checkout: `https://agentchat-web.agentchat.localhost`,
  `https://agentchat-server.agentchat.localhost`
- linked worktree on branch `feat`:
  `https://feat.agentchat-web.agentchat.localhost`,
  `https://feat.agentchat-server.agentchat.localhost`

## Daily Dev

```bash
# main checkout, after a fresh clone
bun install
# put your Convex creds in .env.convex.local (see ./local_environment_setup_checklist.md)
bun scripts/local/setup-tree.ts        # generates .env.local files + agentchat.config.json
bun dev                                # web + server + convex via portless

# new isolated worktree for a feature branch
wt switch -c feat-something
# (post-start hook copies node_modules + .env.convex.local from source via
#  `wt step copy-ignored`, then runs setup-tree.ts)
bun dev
# ... open https://feat-something.agentchat-web.agentchat.localhost ...
wt remove                              # cleans up worktree + ~/.local/state/agentchat-trees/feat-something/
```

`bun dev` is just a `concurrently` over each app's per-package `dev` script,
which itself runs the framework command through `portless run`. Mobile is
deliberately not in `bun dev` (see below).

## What `setup-tree.ts` Does

`bun scripts/local/setup-tree.ts` prepares the current checkout. It does not
start any processes.

- Creates `~/.local/state/agentchat-trees/<branch>/{xdg,sandboxes,logs}` and
  uses those paths in the generated env / config.
- Generates per-tree `BACKEND_TOKEN_SECRET` and `RUNTIME_INGRESS_SECRET` (and
  preserves existing values on re-run, so secrets are stable across hook
  reruns).
- Sources the repo-local `.env.convex.local` for Convex creds. If the file is
  missing it logs and continues; the server will start with placeholder values
  until Convex is configured.
- Writes `apps/web/.env.local`, `apps/server/.env.local`, and
  `apps/server/agentchat.config.json` (filled in from
  `apps/server/agentchat.config.template.json`).
- On first run, deletes any leftover state from the previous lane harness:
  `.agentchat/local/`, `~/.local/state/agentchat/`, and `~/.config/agentchat/`.

The hook is idempotent — re-running on the same tree only touches files whose
contents actually changed.

## Worktrunk Hook Layout

`.config/wt.toml` runs two hooks:

- `post-start`: `bun scripts/local/setup-tree.ts && wt step copy-ignored`
    - `wt step copy-ignored` copies all gitignored files (notably `node_modules/`
      and `.env.convex.local`) from the source checkout to the new worktree, so
      cold installs and Convex creds carry over without manual steps.
- `post-remove`: `bun scripts/local/teardown-tree.ts` removes the per-tree
  state directory.

To point a worktree at a different Convex deployment, edit its
`.env.convex.local` and re-run `bun scripts/local/setup-tree.ts` inside that
worktree.

## Mobile / Expo

`apps/mobile` is intentionally **not** wrapped by portless. Portless's Expo
support is still rough (Metro + HTTPS proxy don't compose cleanly), so mobile
keeps its existing `expo start` flow:

```bash
bun --cwd apps/mobile dev
```

Connect the simulator/device to the worktree's portless server URL. Re-evaluate
this exclusion when portless cuts a release with first-class Expo support.

## Agent Rules

1. `bun install` (only after a fresh clone or major dependency change)
2. `bun scripts/local/setup-tree.ts` if not in a freshly-created worktree
3. `bun dev` when the task needs a live local web/server stack
4. Use `wt switch -c <branch>` to create a disposable worktree; `wt remove` to
   tear it down.

Agents should not hand-edit `apps/web/.env.local`, `apps/server/.env.local`,
or `apps/server/agentchat.config.json`. Re-run setup-tree.ts to regenerate.

## Related Docs

- [README](../README.md)
- [Local Environment Setup Checklist](./local_environment_setup_checklist.md)
