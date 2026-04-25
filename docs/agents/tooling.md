# Tooling And Tests

For the full confidence ladder, read [Harness Engineering](../agentchat/harness-engineering.md). This page is the command reference agents should use while working.

## Package Manager

- Use Bun for installs and scripts: `bun install`, `bun run <script>`.
- Use `bunx <package>` instead of `npx <package>`.

## Local Wrapper Workflow

For checkout-local setup, use the repo-level wrapper commands first:

- `bun run bootstrap`
- `bun run status`
- `bun run doctor`
- `bun run config:print`
- `bun run dev`
- `bun run stop`
- `bun run worktree:create -- <name>`
- `bun run worktree:remove -- <name>`
- `bun run worktree:gc`
- `bun run test:manual:worktree-lifecycle`

Agents should not begin by hand-editing:

- `apps/web/.env.local`
- `apps/server/.env.local`
- `apps/server/agentchat.config.json`

If you deliberately change those generated files, rerun `bun run bootstrap --adopt` to fold the current values into the wrapper-managed manifest. Use `bun run bootstrap --force` only when you intend to discard local drift.

Dev bootstrap refuses shared workspace agents and agent roots outside the current checkout, so wrapper-managed parallel work does not silently fall back to shared mutable state.
`bun run doctor` is allowed to fail when the checkout has not been connected to a dev Convex deployment yet. In that state it should report missing `NEXT_PUBLIC_CONVEX_URL` or `AGENTCHAT_CONVEX_SITE_URL`; complete the Convex setup before runtime or browser work, but do not treat that failure as a wrapper-script regression during script-only audits.

Stable host operations now live under `scripts/host/*.sh`; agents should continue treating those as operator-only unless the task is specifically about the protected host installation.

The current stable host install is live behind local Caddy on `https://bront.home.arpa:4043`. When the task is about the stable host itself, prefer `scripts/host/*.sh` and the host-managed files under `~/.config/agentchat/stable/` over checkout-local wrapper commands.
The stable checkout is expected to be detached at the fetched source commit and may have a local-path `origin` created by `scripts/host/install-stable.sh`; that topology is deliberate for the protected host flow. Update and rollback through `scripts/host/update-stable.sh` and `scripts/host/rollback-stable.sh`, not by treating the stable checkout as a normal tracking clone.

The repo now also includes manual-only GitHub Actions guardrails:

- `.github/workflows/manual-wrapper-guardrails.yml`
- `.github/workflows/host-guardrails-manual.yml`

Those workflows are intentionally `workflow_dispatch` only for now. Treat them as explicit confidence tools, not as always-on CI.

Current stable host helpers include:

- `scripts/host/doctor-stable.sh`
- `scripts/host/smoke-stable.sh`
- `scripts/host/install-stable-user-service.sh`

`bun run worktree:create -- <name>` creates a sibling checkout under the repo parent. It refuses to run from a dirty source checkout unless `--allow-dirty` is passed, because git worktrees only contain committed refs.
If a worktree name already has a Git branch behind it, reusing that name checks out the branch at its current commit. Agents should treat that as a Git gotcha, not as a wrapper bug.
If a sibling worktree is removed outside the wrapper flow, `bun run worktree:gc` is the safe cleanup path for reclaiming stale wrapper-managed leases, process entries, and lane-state directories. Add `-- --dry-run` when you want to inspect what would be cleaned first.
`worktree:gc` only targets missing or abandoned sibling worktrees managed by this repo. It does not touch the stable checkout or unrelated standalone clones.
`worktree:remove` removes the worktree checkout and wrapper-managed state, but it intentionally does not delete the branch name.

Legacy process launchers remain available temporarily for flows still outside the wrapper surface, but they are no longer the authoritative setup path:

- `bun run legacy:dev:mobile`
- `bun run legacy:dev:mobile:expo-go`
- `bun run legacy:dev:all`

## Convex CLI

- `CONVEX_DEPLOYMENT` for local Convex CLI/codegen should live in `packages/convex/.env.local`.
- Dev wrapper bootstrap refuses non-`dev:` Convex deployments.

## Health Checks

Always run the health task for each app you modify before finishing:

- Web: `bun run health:web`
- Server: `bun run health:server`
- Mobile: `bun run health:mobile`
- Shared: `bun run health:shared`
- Convex: `bun run health:convex`

`health` is read-only. It should verify formatting with `format:check` and must not rewrite files.

## Repo Verification

- `bun run lint:architecture` checks cross-surface import boundaries.
- `bun run env:check` verifies environment variables referenced in code are documented.
- `bun run docs:check` verifies docs point at real repo files and real Bun scripts.
- `bun run repo:knip` checks dependency and unlisted-dependency hygiene.
- `bun run type:suppressions` enforces the checked-in suppression baseline.
- `bun run lint:repo` runs the repo-policy verification tier.
- `bun run verify:ci` runs the cheap always-on CI tier.
- `bun run check:affected -- --base origin/main` runs the smallest reasonable verification set for the current working tree.

The health check output may log "Encryption is not configured" from Convex tests; this is expected.

## Tests

- Tests live in `__tests__` folders beside code.
- Run tests with `bun test`.
