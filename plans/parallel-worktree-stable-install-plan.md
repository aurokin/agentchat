# Parallel Worktree And Stable Install Plan

## Motivation

Agentchat now needs two distinct local operating modes on the same host:

- a stable daily-use installation sourced from a dedicated checkout that should not be interrupted by active development
- disposable development environments that can run in parallel across multiple git worktrees and multiple agents

Git worktrees solve source isolation, but they do not solve runtime isolation. Today the repo still has several shared-state and fixed-port assumptions that make parallel work brittle:

- the web dev server is hardcoded to port `4040`
- the backend server is hardcoded to port `3030`
- docs and examples already drift on port usage
- server state, copied workspaces, runtime env, and Convex targets are not yet lane-aware by default
- the default root scripts assume one local stack rather than many coexisting stacks

This plan introduces a protected stable installation for regular use, disposable dev lanes for worktrees, and a command overhaul that makes dev-lane configuration mostly implicit for humans and agents.

## Goals

- Keep a stable local Agentchat install available during active branch work.
- Allow multiple dev worktrees to run on the same host without colliding on ports, state, or generated config.
- Make the normal local workflow one-command bootstrap plus short day-to-day commands.
- Make dev-checkout setup authoritative and automated so agents do not immediately hit env/config bumps.
- Move the repo toward parallel-workflow-friendly defaults and documentation.

## Non-Goals

- Containerizing every workflow in phase 1.
- Solving mobile parallelization in the first slice.
- Supporting arbitrary manual local file editing as the primary workflow.
- Preserving the current root `dev:*` command surface as the main documented path.

## Key Decisions

### Operating Modes

- `stable` is a protected daily-use installation sourced from a dedicated checkout and managed by host shell scripts.
- `dev` is a disposable per-checkout environment, usually backed by a git worktree.

### Lane Is An Internal Concept

The repo should keep dev lane identity as internal metadata, but daily developer commands should stay short:

- `bun run bootstrap`
- `bun run dev`
- `bun run stop`
- `bun run status`
- `bun run doctor`

Explicit lane-oriented commands are still needed for setup and operations:

- `bun run worktree:create -- <name>`
- `bun run worktree:remove -- <name>`
- `scripts/host/install-stable.sh`
- `scripts/host/start-stable.sh`
- `scripts/host/stop-stable.sh`
- `scripts/host/doctor-stable.sh`
- `scripts/host/update-stable.sh`
- `scripts/host/rollback-stable.sh`

### Stable Is Not “Just Another Dev Lane”

The stable install must:

- use production-like commands, not watcher-based dev servers
- live in a dedicated checkout outside the disposable worktree pool
- have fixed URLs and state paths
- have explicit promotion and rollback
- avoid sharing mutable runtime state with dev checkouts

### Root Install Standard

- Root `bun install` is the only standard install step.
- Per-package install commands remain internal escape hatches, not the documented setup path.
- `node_modules` are per checkout/worktree.
- Bun cache is shared globally.

### Default Ports

Keep the current familiar ports as the stable defaults for now:

- stable web: `4040`
- stable server: `3030`

Dev lanes get lane-specific ports derived from reserved or deterministic assignment. They must not rely on hardcoded app defaults.

### Convex Isolation Policy

Stable uses the production Convex deployment for the installed stable source checkout on this host. Setting up that production-targeted stable installation correctly is part of this plan.

Rules going forward:

- stable never shares its production Convex target with disposable dev lanes
- dev lanes may share a separate dev Convex deployment only when backend/schema/auth work is out of scope
- if a dev lane is changing backend behavior, auth behavior, schema, or runtime persistence assumptions, it must not share the stable Convex target
- phase 1 assumes a single Convex owner policy: stable owns production Convex, dev lanes do not

### Workspace Isolation Policy

`shared` workspace mode is unsafe as a default for parallel dev lanes if multiple lanes point at the same mutable root.

Rules going forward:

- stable must not share mutable `shared` agent `rootPath` targets with dev lanes
- dev defaults should prefer `copy-on-conversation`
- if a shared root is unavoidable, the workflow must require an explicit unsafe override and treat one side as effectively read-only

### First Supported Topology

The first implementation slice explicitly supports only:

- one stable checkout
- one dev checkout
- web plus server only
- no mobile parallelization
- no shared-root dev writes
- one Convex owner policy, with stable owning production Convex

Anything beyond that can be layered on after the state and command model are proven.

## Current Problems To Fix

### Hardcoded Runtime Ports

- `apps/web/package.json` hardcodes `4040`
- `apps/server/src/index.ts` hardcodes `3030`

These must become env-driven, with wrapper scripts supplying lane-specific values.

### Shared-State Risks

Parallel work will still interfere if only ports are isolated. Lane identity must drive:

- `PORT`
- `NEXT_PUBLIC_AGENTCHAT_SERVER_URL`
- `XDG_STATE_HOME`
- `sandboxRoot`
- `stateId`
- pid paths
- log paths
- temp paths
- Convex target selection

### Default `stateId` Is Not Worktree-Aware

Equivalent configs can still converge on the same default `stateId`. Lane automation must:

- always write an explicit lane-scoped `stateId`

Relying on config-derived defaults is not safe for concurrent checkouts.

### `XDG_STATE_HOME` Does Not Isolate Sandboxes

Server state can move under a lane-specific `XDG_STATE_HOME`, but copied workspaces still require a lane-specific `sandboxRoot`.

### Host-Scoped Coordination Does Not Belong In A Checkout Manifest

Checkout-local generated config is one concern. Cross-checkout coordination is another.

The implementation must keep a host-scoped registry outside the repo tree for:

- port reservations
- active process ownership
- stable checkout identity
- optional host-level lane metadata

### Current Root Scripts Assume One Stack

The root scripts currently emphasize:

- `dev:web`
- `dev:all`
- `dev:mobile`
- `dev:mobile:expo-go`

These are useful plumbing, but they are not a good primary command surface for stable plus parallel dev lanes.

## Target Command Model

This section describes the end-state command surface, not the phase-1 available surface. Commands introduced in later phases should not be documented as available before their supporting state and ownership abstractions exist.

## Root Commands

### Normal User And Agent Commands

- `bun install`
- `bun run bootstrap`
- `bun run dev`
- `bun run stop`
- `bun run status`
- `bun run doctor`
- `bun run config:print`

These commands should infer the current checkout’s lane metadata and do the right thing without requiring manual env editing.

### Worktree Commands

- `bun run worktree:create -- <name>`
- `bun run worktree:remove -- <name>`

These commands exist for worktree lifecycle, not daily development. They are future convenience commands that land after the current-checkout lane workflow is proven.

### Stable Host Operations

- `scripts/host/install-stable.sh`
- `scripts/host/start-stable.sh`
- `scripts/host/stop-stable.sh`
- `scripts/host/doctor-stable.sh`
- `scripts/host/update-stable.sh`
- `scripts/host/rollback-stable.sh`

These commands are intentionally shell-first because stable is an installed host concern, not a repo-local agent workflow.

### Raw Escape Hatches

Keep app-level raw commands available for direct debugging, but mark them as low-level:

- `raw:web:dev`
- `raw:server:dev`
- `raw:convex:dev`

These should not be the primary documented workflow for humans or agents.

## Subpackage Command Changes

### Root `package.json`

Add wrapper-driven scripts:

- `bootstrap`
- `dev`
- `stop`
- `status`
- `doctor`
- `config:print`
- `worktree:create`
- `worktree:remove`
- host shell scripts under `scripts/host/`
  - `install-stable.sh`
  - `start-stable.sh`
  - `stop-stable.sh`
  - `doctor-stable.sh`
  - `update-stable.sh`
  - `rollback-stable.sh`

Keep verification scripts:

- `health`
- `lint`
- `typecheck`
- `test`
- `verify:ci`
- `check:affected`

Deprecate the following as the main local workflow:

- `dev:web`
- `dev:all`
- `dev:mobile`
- `dev:mobile:expo-go`
- per-package `install:*` as the standard install path

Migration strategy:

- keep old `dev:*` commands available temporarily
- move them under a clearly marked `legacy:` or `raw:` naming scheme early
- remove them from primary docs and agent instructions as soon as wrapper commands exist

### `apps/web/package.json`

Requirements:

- `dev` must read `PORT` and `HOST` from env, defaulting to `4040` and `0.0.0.0`
- `start` must also accept generated stable-install `PORT` and `HOST`
- `build`, `health`, `lint`, `typecheck`, and `test` remain unchanged

### `apps/server/package.json`

Requirements:

- keep `dev` as watch mode for dev lanes
- keep `start` as non-watch mode for stable
- server startup must read `PORT` from env instead of hardcoding `3030`
- `doctor`, `health`, `lint`, `typecheck`, and `test` remain unchanged

### `packages/convex/package.json`

Requirements:

- keep `dev` and `codegen`
- root wrappers decide when Convex is part of a lane’s lifecycle
- Convex should not automatically run for every lane if the lane does not own that deployment

### `apps/mobile/package.json`

Phase 1 decision:

- leave mobile out of the default parallel-lane workflow
- keep mobile scripts intact
- add a future follow-up only when parallel Expo/Metro workflows are actually needed

## Lane Metadata And Generated Files

## Lane Manifest

Introduce one authoritative manifest per checkout. Recommended location:

- `.agentchat/local/manifest.json`

Manifest fields:

- `manifestVersion`
- `laneType`
- `laneId`
- `checkoutPath`
- `webPort`
- `serverPort`
- `serverUrl`
- `webUrl`
- `convexMode`
- `convexDeployment`
- `xdgStateHome`
- `sandboxRoot`
- `stateId`
- `logDir`
- `pidDir`
- `generatedFiles`

This file becomes the source of truth for checkout-local wrapper behavior and generated files.

The stable checkout also gets a checkout-local manifest because it is still an installed checkout from source. Stable identity itself is still resolved through the host registry.

### Host Registry

Introduce a host-scoped registry outside the repo tree. Recommended location:

- `~/.local/state/agentchat/local-host/registry.json`

This path is intentionally host-global and must not depend on lane-scoped `XDG_STATE_HOME`.

Host registry responsibilities:

- reserved ports
- active process ownership
- stable checkout location
- stale lease cleanup metadata

The host registry is the source of truth for cross-checkout coordination. It should not be conflated with the checkout-local manifest.

### Authority Chain

The implementation must keep authority boundaries explicit:

- host registry is authoritative for cross-checkout ownership:
  - stable checkout identity
  - active process ownership
  - reserved ports and leases
- checkout-local manifest is authoritative for checkout-local desired configuration
- generated files are derived outputs for wrappers and live launch inputs for runtimes
- generated files must never be read back by wrappers as canonical inputs

If the manifest and host registry disagree, commands must refuse and require explicit reconciliation rather than silently repairing state.

### Generated Files

Render app-local files from the manifest:

- `apps/web/.env.local`
- `apps/server/.env.local`
- `apps/server/agentchat.config.json`
- optionally `packages/convex/.env.local`

Generated files must be:

- derived from the manifest by one writer module
- lane-specific
- idempotent
- safe to regenerate without silent port reassignment
- versioned through the manifest
- refused by default when drift is detected in manually edited generated files
- overwritten only with an explicit `--force`

## Root Wrapper Script Responsibilities

### `bootstrap`

- materialize config and prerequisites for the current checkout without starting long-running processes
- detect checkout type or accept explicit flags
- run prerequisite checks
- run root `bun install` only when dependencies are missing or when explicitly asked to refresh them
- create or reuse the lane manifest
- reserve or validate ports using the host registry lease rules
- generate local env/config files
- update host-scoped registry state as needed
- print URLs, paths, and next steps
- explain missing optional prerequisites without leaving a half-configured mystery state
- support non-interactive mode cleanly
- exit non-zero on partial failure rather than silently continuing

In the stable checkout, plain `bootstrap` should refuse and direct the user to `scripts/host/install-stable.sh` or the documented stable install procedure.

### `dev`

- refuse to run in the stable checkout
- start only processes owned by the current checkout
- use generated env/config from the manifest
- usually start web and server
- start Convex only when this lane owns it

### `stop`

- stop only processes registered to the current checkout
- never affect stable unless using `scripts/host/stop-stable.sh`

### `status`

- show checkout mode, lane id, ports, URLs, config file paths, Convex mode, and process state
- be sufficient for an agent to recover context in an unfamiliar checkout
- be human-readable first

### `config:print`

- emit machine-readable current-checkout configuration
- include manifest-resolved values, generated file paths, and relevant host-registry ownership state
- support agents and shell scripts without scraping human-oriented status output

### `doctor`

- validate tool prerequisites
- validate generated files and lane metadata
- validate ports and ownership
- wrap deeper checks like `doctor:server` when relevant

### `worktree:create`

- create a git worktree
- initialize checkout lane metadata
- bootstrap the new checkout
- print next steps

### `worktree:remove`

- stop the worktree’s processes
- clean lane-owned state
- refuse to touch stable
- remove the worktree only after safety checks pass

### `scripts/host/install-stable.sh`

- create or refresh the protected stable install checkout
- render stable env/config with fixed URLs, isolated state, and production Convex settings for this host
- verify it does not overlap with any dev checkout state

### `scripts/host/start-stable.sh`

- use production-like commands only
- web must use built output plus `start`
- server must use non-watch `start`
- validate readiness before reporting success

### `scripts/host/update-stable.sh`

- update stable to a chosen ref
- run install, build, and verification
- restart stable cleanly
- persist rollback metadata
- validate readiness and automatically fail back to rollback path if promotion validation does not pass

### `scripts/host/rollback-stable.sh`

- restore the last known good ref and restart

## Process And State Isolation Rules

These rules must be encoded in scripts and docs, not left implicit.

### Every Lane Must Own Distinct Values For

- web port
- server port
- `NEXT_PUBLIC_AGENTCHAT_SERVER_URL`
- `XDG_STATE_HOME`
- `sandboxRoot`
- `stateId`
- pid directory
- log directory

### Stable Must Not Share

- production Convex deployment with disposable dev lanes
- mutable `shared` agent roots with dev lanes
- secrets bundle with generated dev env
- watcher processes

### Cleanup Safety Rules

- current-checkout cleanup must not touch stable
- stable cleanup must be explicit
- removal must refuse overlapping paths
- process killing must use lane-owned process metadata plus host-registry verification rather than broad port-based heuristics
- stale pid files alone must never be treated as authoritative ownership

### Port Allocation Rules

Port allocation follows one order of operations:

1. derive a deterministic preferred port for the checkout
2. check live port availability
3. verify or acquire the corresponding host-registry lease
4. if the preferred port cannot be used, refuse or require explicit reassignment rather than silently drifting

### Reconciliation Rules

Commands must follow these tie-break rules:

- manifest vs host-registry mismatch:
  - refuse and require explicit reconciliation
- generated file drift from manifest-derived content:
  - refuse by default
  - overwrite only with `--force`
- missing or corrupted host registry with intact manifest:
  - rebuild host-scoped ownership state only through bootstrap/status reconciliation, never by trusting generated files
- stale stable-checkout pointer:
  - refuse stable operations until the host registry is repaired or rebound explicitly

## Proposed File Layout

New internal scripting area:

```text
scripts/local/
  bootstrap.ts
  dev.ts
  stop.ts
  status.ts
  doctor.ts
  worktree-create.ts
  worktree-remove.ts
  lib/
    resolve-current-lane.ts
    load-manifest.ts
    write-manifest.ts
    reserve-ports.ts
    write-env-files.ts
    prereq-checks.ts
    process-registry.ts
    paths.ts
scripts/host/
  install-stable.sh
  start-stable.sh
  stop-stable.sh
  doctor-stable.sh
  update-stable.sh
  rollback-stable.sh
```

New per-checkout generated state:

```text
.agentchat/
  local/
    manifest.json
```

New host-scoped coordination state:

```text
/home/auro/.local/state/agentchat/local-host/
  registry.json
  process-registry.json
  port-leases.json
```

## Documentation Updates Required

This plan only works if the documentation stops teaching single-stack assumptions and manual local file editing as the default path.

### `AGENTS.md`

Update the repository instructions to:

- tell agents to prefer root `bootstrap`, `dev`, `status`, and `doctor`
- tell agents to prefer `config:print` when they need machine-readable lane context
- discourage manual editing of generated lane env/config files unless the task explicitly targets lane automation
- call out that stable and dev are separate operating modes
- tell agents that stable is a protected host installation and repo-local dev commands should not be run there
- tell agents to never choose `legacy:` or `raw:` commands when a wrapper command exists for the task

### `docs/agents/tooling.md`

Add:

- the new root command surface
- the rule that root `bun install` is the standard install path
- the distinction between normal commands and raw escape hatches
- the stable host-install vs dev-checkout runtime rule
- the rule that `bootstrap` prepares but does not start long-running processes
- the rule that generated lane files are derived artifacts, not manual inputs

### `docs/agents/overview.md`

Add:

- a short explanation of local operating modes
- the fact that local runtime state is lane-scoped, not globally shared

### `docs/agents/workspace.md`

Add guardrails:

- dev workflows should default to `copy-on-conversation`
- do not configure dev lanes to share mutable `shared` roots with stable
- `sandboxRoot`, `stateId`, and runtime state must remain lane-scoped

### `README.md`

Replace the current local-start guidance with:

- root `bun install`
- `bun run bootstrap`
- `bun run dev` for development
- stable host-install setup and worktree workflows at a high level

The README should explain:

- stable local install for regular use
- disposable dev checkout for repository work
- when Convex sharing is safe vs unsafe
- where the canonical local workflow doc lives
- that stable host operations use `scripts/host/*.sh`, while developers use `bun run bootstrap` plus repo-local dev wrappers

### `docs/local_environment_setup_checklist.md`

This document needs a major rewrite. It should become a migration and advanced-reference document, not the primary first-run quickstart. It should cover:

- stable host installation
- normal dev bootstrap
- worktree bootstrap
- Convex policy and separation guidance
- optional mobile follow-up, explicitly marked as out of the main path
- legacy command migration notes

### New `docs/local-modes.md`

Add a new canonical local workflow document covering:

- “I want to use Agentchat locally” -> stable host-install path
- “I want to work on the repo” -> dev path
- “I want a disposable worktree for an agent” -> worktree path
- what `bootstrap`, `dev`, `status`, `doctor`, and `config:print` mean
- what is generated automatically
- what is deprecated
- which paths are available now versus planned later

### `docs/agentchat/README.md`

Add this plan to the canonical index so agents can find it.

### `docs/agentchat/operator-guide.md`

Add:

- local host stable install guidance
- stable production Convex setup guidance
- guidance on separate Convex targets
- guidance on avoiding shared mutable agent roots

### `docs/agentchat/server-config-spec.md`

Add or clarify:

- lane-scoped `sandboxRoot`
- lane-scoped `stateId`
- the risks of shared `rootPath` when using `shared` workspace mode

### `docs/agentchat/roadmap.md`

Add a line item for:

- local parallel workflow support
- stable host-install rollout
- worktree automation

### `docs/agentchat/testing-plan.md`

Add validation coverage for:

- stable install plus dev lane coexistence
- multi-dev-lane isolation
- bootstrap idempotence
- generated-file drift detection
- stop/remove safety
- promotion and rollback

### `docs/agentchat/manual-qa-checklist.md`

Add explicit QA scenarios for:

- fresh user bootstrap
- stable install staying available while dev lanes churn
- incorrect shared-root configuration rejection

## Documentation Enforcement Going Forward

To keep parallel-workflow-friendly defaults from regressing:

- root wrapper commands become the primary documented path everywhere
- generated files are treated as implementation outputs, not tutorial entry points
- new local setup docs must not reintroduce “edit these three files manually” as the main path
- changes to local startup must update the canonical local workflow doc in the same PR
- changes to local startup, config paths, or ports must update:
  - `README.md`
  - `docs/local-modes.md`
  - `docs/local_environment_setup_checklist.md`
  - `docs/agents/tooling.md`
  - any affected `.env.example` files
- lane-safety checks should be automated where possible rather than enforced only by prose

## Migration Matrix

| Phase | Supported commands | Legacy commands | Agent-allowed commands | Docs-authoritative commands |
| --- | --- | --- | --- | --- |
| Phase 0 | none new | existing raw workflow | existing workflow only | existing docs |
| Phase 1a/1b | `bootstrap`, `status`, `doctor`, `config:print` | may still work, but become non-authoritative | wrapper commands only when available | wrapper commands only |
| Phase 2 | add `dev`, `stop` | compatibility shims only | wrapper commands only | wrapper commands only |
| Phase 3-4 | add `scripts/host/*.sh` for stable install/lifecycle | compatibility shims only | wrapper commands only for dev; host scripts only for stable | wrapper commands only for dev; host docs for stable |
| Phase 5+ | add `worktree:*` | compatibility shims may remain for debugging only | wrapper commands only | wrapper commands only |

As soon as a wrapper command exists for a task, agents must stop using legacy/raw commands for that task.

## Implementation Phases

## Phase 0: Topology Lock-In

- choose stable as a dedicated checkout outside the worktree pool
- lock the first-slice Convex policy:
  - stable uses production Convex on this host
  - dev lanes do not touch production Convex
- define the host-scoped registry location and data model
- define manifest versioning and generated-file drift policy

Exit criteria:

- stable topology is no longer an open question
- first-slice Convex ownership is fixed
- host-scoped versus checkout-scoped state is clearly separated

## Phase 1a: Schema And Ownership Foundations

- parameterize web and server ports
- introduce checkout-local manifest format
- introduce host-scoped registry format
- lock the authority chain
- lock generated-file drift policy
- lock port allocation and lease rules
- lock explicit lane-scoped `stateId`
- implement shared-root overlap detection and default blocking
- rewrite first-run docs and agent workflow docs in the same phase

Exit criteria:

- manifest and host-registry responsibilities are no longer ambiguous
- generated-file and mismatch behavior are hard rules, not suggestions
- docs no longer teach manual `.env.local` editing or `dev:web` as the main path

## Phase 1b: Prepare And Inspect Commands

- add `bootstrap`, `status`, `doctor`, and `config:print`
- generate checkout-specific local env/config files
- clean up current port drift in docs and examples

Phase 1b explicitly supports only:

- one stable checkout
- one dev checkout
- web plus server only
- no mobile
- no worktree lifecycle wrappers yet

Exit criteria:

- a checkout can bootstrap itself with one command
- generated files are stable and idempotent
- status clearly explains the current lane
- `config:print` is sufficient for automation

## Phase 2: Dev Lane Runtime

- add `dev` and `stop`
- add process registry ownership
- ensure cleanup cannot kill unrelated processes
- support one stable checkout plus one dev checkout concurrently

Prerequisites:

- process registry semantics are implemented
- host-registry lease cleanup exists
- unsafe shared-root overlap is blocked by default

Exit criteria:

- stable and one dev checkout can run simultaneously without state overlap
- `stop` only affects the current checkout

## Phase 3: Stable Host Operations

- add `scripts/host/install-stable.sh`, `start-stable.sh`, `stop-stable.sh`, and `doctor-stable.sh`
- switch stable to production-like build/start behavior
- isolate stable logs, secrets, state, and config

Prerequisites:

- stable checkout location is locked and registered
- readiness checks are implemented

Exit criteria:

- stable can run without watchers
- stable has fixed URLs and isolated state

## Phase 4: Promotion And Rollback

- add `scripts/host/update-stable.sh` and `rollback-stable.sh`
- define last-known-good metadata
- document and test the promotion flow

Prerequisites:

- rollback metadata format is defined
- readiness validation and fail-back behavior are implemented

Exit criteria:

- stable can be promoted and rolled back with explicit commands

## Phase 5: Worktree Lifecycle

- add `worktree:create` and `worktree:remove`
- wire worktree lifecycle into lane bootstrap and cleanup

Exit criteria:

- a new disposable checkout is one command away
- removal is safe and does not touch stable

## Phase 6: Policy Hardening

- enforce safer defaults around shared roots and Convex targets
- add docs and checks for unsupported overlap cases
- harden already-chosen default blocking behavior and diagnostics

Exit criteria:

- unsafe overlap cases are either blocked or loudly diagnosed

## Validation Matrix

### Phase 1 Validation

- one stable checkout and one dev checkout can coexist with distinct ports, `stateId`, `XDG_STATE_HOME`, `sandboxRoot`, logs, and ownership metadata
- bootstrap works non-interactively for agents
- `config:print` is sufficient for machine-readable checkout recovery

### Later-Phase Validation

- stable plus two dev lanes can coexist with distinct ports, `stateId`, `XDG_STATE_HOME`, `sandboxRoot`, logs, and pids
- a dev lane cannot stop or clean up stable by mistake
- a dev lane cannot silently reuse another lane’s state

### Bootstrap And UX

- fresh clone to running app with one command and no manual env edits
- re-running bootstrap preserves ports and generated config unless explicitly reassigned
- status is sufficient for an agent to understand the current checkout
- `config:print` is sufficient for machine-readable checkout recovery
- bootstrap works non-interactively for agents

### Stable Reliability

- stable remains reachable while dev lanes are created, started, stopped, and deleted
- stable uses non-watch runtime commands
- host reboot or process restart behavior is documented and testable

### Backend Safety

- backend-changing dev work does not affect stable if stable isolation policy is followed
- production Convex is reserved for stable
- shared dev Convex usage is documented as safe only for limited cases

### Shared Root Safety

- risky `shared` root overlap is rejected by default and only allowed behind an explicit unsafe override

## Open Questions

- After phase 1, should any dev lane be allowed to own a separate dev Convex target directly, or should Convex ownership remain centralized longer?
- When mobile parallelization becomes in-scope, should it follow the same manifest or a separate mobile-specific wrapper?

## Recommended Immediate Next Steps

1. Approve the command surface and operating-mode model in this plan.
2. Implement phase 0 decisions before writing wrapper commands.
3. Implement phase 1 foundations before adding worktree lifecycle wrappers.
4. Update the agent docs and local setup docs as part of the same changeset as the first wrapper commands.
5. Treat any future local workflow changes as incomplete unless they preserve lane isolation and update the canonical docs.

## Locked Decisions

These decisions are now treated as fixed defaults for implementation unless a later explicit change updates this plan.

### Stable Checkout Path

- default stable checkout path on this host: `/home/auro/code/agentchat/stable`

This is a dedicated checkout outside the disposable worktree pool.

### Host-Global Registry Path

- default host-global registry root: `/home/auro/.local/state/agentchat/local-host`

This path is host-global and must not vary per lane.

### Port Allocation Policy

Use deterministic preferred ports with host-registry-backed leases and explicit fallback.

Default port policy:

- stable web: `4040`
- stable server: `3030`
- first dev web preferred port: `4041`
- first dev server preferred port: `3031`

Allocation order:

1. compute deterministic preferred port from lane identity
2. check live port availability
3. verify or acquire host-registry lease
4. if unavailable, refuse by default and require explicit reassignment

The implementation should not silently drift to arbitrary free ports.

### `bootstrap` Install Behavior

- `bootstrap` may run `bun install` automatically only when dependencies are clearly missing
- otherwise `bootstrap` should leave dependency state alone unless given an explicit install/refresh flag

This keeps first-run setup simple without making every bootstrap mutate dependencies.

### Drift And Adoption Policy

Generated-file handling defaults:

- refuse drift by default
- `--adopt` may import an existing hand-edited local setup into the new manifest model under explicit operator intent
- `--force` may overwrite generated files from manifest-derived content

Wrappers must never silently adopt or overwrite hand-edited runtime inputs.

### Stable Secret Management

Stable production secrets are host-managed, not ordinary dev-checkout dotfiles.

Implementation default:

- host shell scripts may render runtime env files for the stable checkout
- secret source-of-truth should live in host-managed inputs outside disposable dev checkouts
- dev checkouts must never reuse stable production secrets

### Stable Shared-Root Policy

- stable/dev overlap on risky `shared` roots is a hard block by default
- no default unsafe override is assumed for the first slice

If an override is ever added later, it must be an explicit opt-in and remain outside the first supported topology.

### Phase-1 Convex Rule For Dev

- stable owns production Convex
- dev checkouts do not own any Convex target in phase 1
- dev checkouts must not claim production Convex or mutate production Convex settings

Support for dev-owned non-production Convex can be considered only after the first slice is proven.

### First Implementation PR Scope

The first implementation PR should include only:

- host-global registry and checkout-local manifest foundations
- explicit lane-scoped `stateId`
- lane-scoped `sandboxRoot` generation
- web/server port parameterization
- `bootstrap`
- `status`
- `doctor`
- `config:print`
- docs cutover to the wrapper-first workflow
- relabeling old commands as legacy shims

The first implementation PR should not include:

- `dev` and `stop`
- `scripts/host/start-stable.sh` / `scripts/host/stop-stable.sh`
- `worktree:create/remove`
- `scripts/host/update-stable.sh` / `scripts/host/rollback-stable.sh`
- multi-dev support
- dev-owned Convex

## Pre-Implementation Investigation Results

These findings came from focused reviews of the current repo and should be treated as implementation constraints, not optional follow-up ideas.

### Current-State Inventory

The repo still assumes a single local stack in several places:

- root `dev` behavior in `package.json`
- hardcoded web and server ports
- manual `.env.local` editing in docs
- raw per-app commands in the README
- smoke and confidence tooling that assumes `4040` and `3030`

Implementation must account for all of these in the first migration slice, or the wrapper model will lose to the already-documented habits.

Highest-priority repo areas:

- `package.json`
- `apps/web/package.json`
- `apps/server/src/index.ts`
- `apps/server/src/config.ts`
- `apps/server/src/serverState.ts`
- `README.md`
- `docs/local_environment_setup_checklist.md`
- `docs/agents/tooling.md`
- `scripts/testing/*`

### Authority Model Clarification

The phrase “generated files are derived artifacts only” needs a narrower interpretation:

- wrappers treat generated files as derived outputs
- runtime processes still consume generated files as live inputs

The server already treats `apps/server/agentchat.config.json` as a canonical runtime input, so the orchestration layer must not pretend the runtime ignores that file.

The required authority chain is:

- host registry:
  - authoritative for cross-checkout ownership
  - stable checkout identity
  - active process ownership
  - port leases
- checkout-local manifest:
  - authoritative for desired checkout-local configuration
- generated files:
  - rendered from the manifest by one writer module
  - consumed by runtimes as launch inputs
  - never parsed by wrappers as canonical inputs
- runtime state:
  - observed process/runtime state only
  - never a source of truth for desired config or ownership

### Process Ownership Investigation

Safe stop semantics must assume the runtime tree is multi-process:

- Next may spawn children
- `convex dev` may spawn children
- the backend server can spawn long-lived Codex child processes

Therefore:

- host registry must own lane sessions and service-group ownership
- wrappers should spawn managed services in dedicated process groups
- `stop` should signal process groups, not only PIDs
- PID files are debug aids only, not authority

Minimum tracked fields per managed service:

- `laneId`
- `laneType`
- `sessionId`
- `service`
- `checkoutPath`
- `cwd`
- `pid`
- `pgid`
- `command`
- `startedAt`
- expected ports
- current state

### Stable-On-Production-Convex Host Contract

Stable needs a stricter contract than the dev path.

Stable checkout must require:

- dedicated checkout outside the worktree pool
- explicit `stateId`
- explicit `sandboxRoot`
- explicit `XDG_STATE_HOME`
- explicit stable server URL
- explicit production Convex identifiers

Stable server runtime must match production Convex exactly for:

- `BACKEND_TOKEN_SECRET`
- `AGENTCHAT_CONVEX_SITE_URL`
- `RUNTIME_INGRESS_SECRET`

Stable also depends on production Convex auth config aligning with the stable web URL, especially `SITE_URL`.

Stable preflight should verify:

- backend session mint/verify path works
- runtime ingress to Convex works
- stable web URL and Convex `SITE_URL` align
- auth redirect expectations are satisfied

### Migration Investigation

Behavioral drift is the main migration risk. The repo currently teaches three competing workflows:

- raw per-app commands
- root `dev:*` orchestration
- manual `.env.local` and config editing

The first implementation PR must change code and docs together.

Immediate migration rules:

- as soon as a wrapper command exists for a task, agents must stop using legacy/raw commands for that task
- legacy commands may remain callable temporarily, but become non-authoritative immediately
- docs must stop teaching legacy commands in the same phase they become non-authoritative

### Smallest Viable First Slice

Do not start with worktree lifecycle, promotion/rollback, or multi-dev support.

The smallest viable slice is:

- one dedicated stable checkout
- one dev checkout
- web and server only
- stable on production Convex
- dev forbidden from production Convex
- add only:
  - explicit lane-scoped `stateId`
  - checkout-local manifest
  - host-global registry
  - generated web/server env and server config
  - `bootstrap`
  - `status`
  - `doctor`
  - `config:print`
  - `dev`
  - `stop`
  - `scripts/host/install-stable.sh`
  - `scripts/host/start-stable.sh`
  - `scripts/host/stop-stable.sh`
  - `scripts/host/doctor-stable.sh`

Explicitly defer:

- `worktree:create/remove`
- `scripts/host/update-stable.sh` / `scripts/host/rollback-stable.sh`
- multi-dev support
- dev-owned Convex
- mobile orchestration
- OS-specific service manager templates

## Implementation Checklist

### Before Coding

- lock the authority chain
- lock the generated-file drift policy
- lock the port allocation algorithm
- lock the stable host contract
- lock the first-slice migration matrix
- lock the first-slice acceptance tests

### First Implementation PR

- replace root `dev` semantics in `package.json`
- add `bootstrap`, `status`, `doctor`, and `config:print`
- add wrapper-owned manifest and host-global registry
- parameterize web/server ports
- force explicit lane-scoped `stateId`
- generate lane-scoped `sandboxRoot`
- rewrite:
  - `README.md`
  - `docs/local-modes.md`
  - `docs/local_environment_setup_checklist.md`
  - `docs/agents/tooling.md`
  - `docs/agentchat/operator-guide.md`
- relabel old commands as legacy shims

### Second Implementation PR

- add `dev` and `stop`
- add process-group-aware ownership and stop behavior
- add `scripts/host/install-stable.sh`, `start-stable.sh`, `stop-stable.sh`, and `doctor-stable.sh`
- add stable preflight checks

### Deferred Work

- worktree lifecycle wrappers
- stable host update and rollback scripts
- multi-dev support
- dev-owned Convex workflows
- mobile parallelization

## First-Slice Acceptance Checklist

- `bootstrap` prepares config and does not start processes
- `bootstrap` refuses drift by default and overwrites only with `--force`
- `bootstrap` refuses in the stable checkout and points to `scripts/host/install-stable.sh`
- `config:print` emits machine-readable resolved config plus relevant ownership state
- `status` is sufficient for human/agent context recovery
- stable and dev have distinct:
  - `stateId`
  - `XDG_STATE_HOME`
  - `sandboxRoot`
  - server port
  - web URL
  - ownership metadata
- dev cannot claim production Convex
- dev cannot overlap stable on risky shared roots without explicit unsafe override
- `dev` starts only dev-owned services
- `stop` stops only dev-owned services
- `scripts/host/start-stable.sh` uses non-watch commands only
- `scripts/host/stop-stable.sh` stops only stable-owned services
- docs no longer teach `dev:web`, raw per-app commands, or manual `.env.local` editing as the primary path
