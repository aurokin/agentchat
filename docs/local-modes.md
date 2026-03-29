# Local Modes

This is the canonical local workflow doc for Agentchat.

Use it when you need to prepare a checkout for local work without colliding with other checkouts on the same host.

## Operating Modes

Agentchat currently supports two local modes:

- `stable`: protected daily-use installation sourced from a dedicated checkout on this host
- `dev`: disposable development checkout, usually a git worktree

Stable host scripts, checkout-local wrappers, and worktree lifecycle wrappers are implemented in-repo. The remaining work is public-hostname activation, deeper multi-worktree confidence coverage, and future mobile parallelization.

## Available Now

From the repo root:

```bash
bun install
bun run bootstrap
bun run status
bun run doctor
bun run config:print
bun run dev
bun run stop
bun run worktree:create -- <name>
bun run worktree:remove -- <name>
```

Stable host-install commands now available from the repo root:

```bash
scripts/host/install-stable.sh
scripts/host/doctor-stable.sh
scripts/host/smoke-stable.sh
scripts/host/start-stable.sh
scripts/host/stop-stable.sh
scripts/host/update-stable.sh
scripts/host/rollback-stable.sh
scripts/host/generate-stable-convex-env.sh
scripts/host/apply-stable-convex-env.sh
scripts/host/install-stable-user-service.sh --enable-now
```

Manual-only GitHub guardrail workflows are also checked in now:

- `.github/workflows/manual-wrapper-guardrails.yml`
- `.github/workflows/manual-host-guardrails.yml`

They use `workflow_dispatch` only. They are intentionally not enabled as automatic GitHub checks yet.

Wrapper-owned runtime commands now cover the current checkout web/server stack:

```bash
bun run dev
bun run stop
```

`bun run dev` now refuses to start when the wrapper doctor still reports missing Convex or server-secret configuration, so broken placeholder stacks fail fast instead of booting partially.

New worktrees are created as sibling checkouts under the repo parent directory, for example `/home/auro/code/agentchat/<name>`. `worktree:create` refuses to run from a dirty source checkout by default so agents do not accidentally create a checkout that is missing local uncommitted changes.
If you reuse an existing worktree name, Git reattaches that branch at its current commit; it does not automatically move the branch to the source checkout's latest `HEAD`.

Legacy escape hatches still exist for workflows that are not yet wrapper-owned:

```bash
bun run legacy:dev:mobile
bun run legacy:dev:mobile:expo-go
bun run legacy:dev:all
```

## What `bootstrap` Does

`bun run bootstrap` prepares the current checkout. It does not start long-running processes.

It currently:

- auto-runs `bun install` only when the root `node_modules` directory is missing
- refuses to run in the dedicated stable checkout
- materializes a checkout-local manifest at `.agentchat/local/manifest.json`
- records host-scoped coordination files under `~/.local/state/agentchat/local-host/`
- writes checkout-specific generated files:
    - `apps/web/.env.local`
    - `apps/server/.env.local`
    - `apps/server/agentchat.config.json`
- writes explicit lane-scoped `stateId`, `sandboxRoot`, and `XDG_STATE_HOME`
- reserves deterministic checkout-scoped dev ports for the current checkout
- refuses shared or out-of-checkout agent roots in wrapper-managed dev config

## Host-Level Layout

The wrapper now supports a host-level layout under `~/.config/agentchat/`.

Recommended files:

- `~/.config/agentchat/config.json`
- `~/.config/agentchat/dev/convex.env`
- `~/.config/agentchat/stable/web.env`
- `~/.config/agentchat/stable/server.env`
- `~/.config/agentchat/stable/convex.env`
- `~/.config/agentchat/stable/server-config.json`
- `~/.config/agentchat/stable/convex-runtime.env`

Example host config:

- [agentchat-host-config.example.json](./examples/agentchat-host-config.example.json)

Current dev bootstrap behavior:

- reads shared dev Convex input from the host-configured `dev/convex.env` path first
- respects `dev.defaultHost` and `stable.defaultHost` from `config.json` when generating wrapper-managed env files
- exposes dormant `stable.lanUrl`, `stable.publicUrl`, and `stable.secondaryUrls` fields for future public-hostname cutover planning
- can still adopt existing repo-local `.env` values during migration
- renders checkout-local `.env.local` files from the manifest after bootstrap

Those stable URL fields are metadata only right now. They do not change the live routing, Convex `SITE_URL`, or Caddy behavior until you intentionally turn the public hostname on.

## Drift And Adoption

Generated local files are wrapper-owned.

If you manually change generated files and want the wrapper model to keep those values, rerun:

```bash
bun run bootstrap --adopt
```

If you want to discard drifted local files and regenerate them from the current manifest, rerun:

```bash
bun run bootstrap --force
```

## Current First-Slice Limits

This repo intentionally supports only this minimal topology right now:

- one stable checkout on the host
- deterministic checkout-scoped ports and host leases for disposable dev worktrees
- wrapper-owned `dev` / `stop` for web plus server only
- shell-based stable install/start/stop/doctor flow
- `worktree:create` / `worktree:remove` for disposable checkout lifecycle
- manual-only GitHub guardrail workflows for wrapper and stable-host scaffolding
- no mobile parallelization yet

Use the remaining legacy dev scripts only for flows that are still outside the wrapper-owned runtime surface.

## Stable Host Reality

The protected stable install is no longer theoretical. The current host model is:

- stable source checkout outside the disposable worktree pool
- shell-first stable lifecycle under `scripts/host/`
- production Convex wired through host-managed files under `~/.config/agentchat/stable/`
- LAN HTTPS currently served through local Caddy at `https://bront.home.arpa:4043`
- dormant host-config metadata for a future public entrypoint such as `https://agentchat.maleniaslab.com`

Treat that stable install as an operator-managed source install, not as another dev lane.

## Agent Rules

Agents should follow this order:

1. `bun install`
2. `bun run bootstrap`
3. `bun run status`
4. `bun run doctor`
5. `bun run dev` when the task needs a live local web/server stack
6. `bun run stop` when the task is complete or the runtime should be torn down

When agents need a disposable checkout instead of modifying the current one, create it with `bun run worktree:create -- <name>` from an existing checkout, then continue the same bootstrap/status/doctor/dev flow inside that worktree. Remove it with `bun run worktree:remove -- <name>` from the source checkout that created it.

Agents should not begin by hand-editing `apps/web/.env.local`, `apps/server/.env.local`, or `apps/server/agentchat.config.json` unless they are deliberately doing a drift migration and then re-running `bun run bootstrap --adopt`.

## Related Docs

- [README](../README.md)
- [Tooling And Tests](./agents/tooling.md)
- [Local Environment Migration And Advanced Setup](./local_environment_setup_checklist.md)
- [Stable Host Runbook](./agentchat/stable-host-runbook.md)
- [Parallel Worktree And Stable Install Plan](../plans/parallel-worktree-stable-install-plan.md)
