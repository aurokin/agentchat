# Runtime Foundation Reconciliation Status

Linear issue: [AUR-124](https://linear.app/aurokin/issue/AUR-124/linear-and-docs-reconciliation)

This document summarizes the trunk reconciliation result after the runtime
foundation cleanup sweep. It is the durable handoff between branch cleanup and
the final verification gate.

## Branch Outcome

Current trunk is the source of truth.

- `origin/parallel_prep` is already present on trunk through earlier wrapper,
  worktree, and stable-host work.
- `origin/pr/scoped-runtime-workspaces` is already represented by the scoped
  runtime implementation on trunk; its remaining direct diff is obsolete.
- `origin/agent_mode` is superseded by trunk and should be treated only as
  historical evidence for specific regression investigations.

Do not directly merge stale runtime branches into trunk. Use
[Branch Reconciliation Inventory](./branch-reconciliation-inventory.md) for the
evidence trail.

## Completed Foundation

The cleanup sweep has landed the foundation needed before new runtime kinds:

- scoped workspace identity and runtime lifecycle isolation are verified on
  trunk
- operator wrapper, worktree, and stable-host tooling are preserved
- agent-owned inline runtime config is supported for Codex agents
- legacy top-level provider config remains as a compatibility bridge
- `KindRuntime` extraction exists with Codex as the active implementation
- Codex provider metadata has a passive event lane for diagnostics and replay
- model catalog behavior is hardened for GPT-5.4 mini, GPT-5.5, and future live
  model discovery
- web refresh/root-cause handling preserves draft input by avoiding unnecessary
  full-page remounts during background bootstrap, auth, and wrapper refreshes

The current config file is still `version: 1` while accepting v2-style inline
agent runtime blocks. Keep new configs provider-light: `providers: []` plus
`agents[].runtime`.

## Deferred Work

These are not part of the completed foundation:

- Pi runtime implementation
- OpenCode runtime implementation
- Claude Code runtime implementation
- ACP-compatible clients
- approval UI beyond current auto-approve behavior
- admin UI for managing agents or runtime config

Each deferred item should start from the current `KindRuntime` and
agent-owned-runtime foundation rather than reviving stale provider-merge branch
assumptions.

## Final Gate

After this docs/Linear reconciliation, run
[AUR-125](https://linear.app/aurokin/issue/AUR-125/final-runtime-foundation-verification-gate)
to prove the reconciled trunk with the broadest locally available verification
set and recorded residual risks.
