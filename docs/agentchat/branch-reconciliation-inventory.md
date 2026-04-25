# Branch Reconciliation Inventory

Linear issue: [AUR-115](https://linear.app/aurokin/issue/AUR-115/branch-reconciliation-inventory)

This inventory records the reconciliation status for the stale Agentchat
branches that still matter to the runtime-foundation cleanup sweep. It is an
evidence artifact, not an implementation plan for direct merges.

## Branch Topology

Captured after `git fetch --all --prune` on `master` at `ab9efad`.

| Branch | Head | Merge base with `master` | Relationship to `master` | Conclusion |
| --- | --- | --- | --- | --- |
| `master` / `origin/master` | `ab9efad` | n/a | Current trunk | Source of truth. |
| `origin/agent_mode` | `be9db02` | `0134803` | 58 branch-only commits, 49 trunk-only commits | Superseded by the scoped-runtime squash on trunk and later wrapper/stable-host work. Do not merge. |
| `origin/pr/scoped-runtime-workspaces` | `4adc759` | `0134803` | 19 branch-only commits, 49 trunk-only commits | Substantially squash-merged into trunk as `b359414`; only stale web `ChatContext` type narrowing remains. Do not merge. |
| `origin/parallel_prep` | `1784050` | `1784050` | Ancestor of `master`; 0 branch-only commits | Already present on trunk through PRs #4, #5, and #6. |

Important trunk commits:

- `b359414` - `feat: scope runtimes and isolate conversation workspaces (#2)`.
- `95eaf7e` - `Preserve local agent visibility config (#3)`.
- `064e577`, `0efbe05`, `4db3221` - merged `parallel_prep` work.
- `de17ebc` - checked-in agent skills that stale runtime branches would delete in a direct merge.
- `ab9efad` - current progressive docs and harness-engineering refactor.

## Direct Merge Risk

Do not directly merge `origin/agent_mode` or
`origin/pr/scoped-runtime-workspaces` into current trunk.

Direct merge risks:

- Deletes newer `.agents/skills` and `.claude/skills` content from trunk.
- Deletes manual wrapper and host guardrail workflows from `.github/workflows`.
- Deletes or rolls back stable-host documentation and examples.
- Reverts the current harness documentation, including
  [Harness Engineering](./harness-engineering.md).
- Reverts wrapper/stable-host hardening from `parallel_prep`.
- Reverts newer web failure-state behavior from `4403f9c`, specifically the
  widened `ChatContext.updateMessage` type that can update `status` and `kind`.
- Reintroduces older provider/runtime wording and docs that conflict with the
  current agent-centric harness documentation.

## Branch Findings

### `origin/parallel_prep`

Classification: **already present**

`origin/parallel_prep` is an ancestor of `master`. Its local wrapper,
worktree, stable-host, CI visibility, and lane cleanup changes are already on
trunk through PRs #4, #5, and #6.

No branch replay is needed.

### `origin/pr/scoped-runtime-workspaces`

Classification: **already present with one obsolete difference**

The branch's functional content is already on trunk through squash commit
`b359414`. The current diff from `master` is limited to
`apps/web/src/contexts/ChatContext.tsx`, where the branch narrows
`updateMessage` updates to `content`, `contextContent`, and `reasoning`.

Current trunk intentionally allows `status` and `kind` updates. That newer
behavior comes from `4403f9c` and supports visible send-failure state. The
branch version is obsolete and should not be replayed.

No branch replay is needed.

### `origin/agent_mode`

Classification: **superseded / do not replay directly**

`origin/agent_mode` is a longer alternative hardening line from the same old
base. It touches the same major surfaces as the scoped-runtime branch:

- `apps/server/src/codexRuntime.ts`
- `apps/server/src/workspaceManager.ts`
- `apps/server/src/workspaceReconciliation.ts`
- `packages/convex/convex/runtimeIngress.ts`
- web and mobile `ChatContext` runtime state

Current trunk already contains the safer scoped-runtime implementation from
`b359414`, plus later wrapper and stable-host work. The remaining
`agent_mode` diff mostly reflects an older alternative state. It should be used
only as historical evidence when investigating a specific regression.

No direct replay is recommended.

## Functional Slice Classification

| Slice | Source evidence | Status | Notes |
| --- | --- | --- | --- |
| Workspace identity | `conversation-scope-key.ts`, `ChatContext`, Convex `chats` indexes | Already present | Trunk scopes conversation state by agent and conversation. Validate in AUR-116 rather than replaying branch code. |
| Sandbox paths | `sandboxPaths.ts`, `workspaceManager.ts`, config validation | Already present | Trunk includes safe segment encoding, sandbox root validation, and copy-on-conversation path handling. |
| Runtime lifecycle | `codexRuntime.ts`, `websocketSession.ts`, runtime persistence tests | Already present; verify | Trunk includes runtime recycling, teardown, recovery, and workspace-mode persistence from the scoped-runtime squash. AUR-117 should verify edge cases rather than merge branch code. |
| Convex ingress | `runtimeIngress.ts`, `runtime_bindings`, chat lookup indexes | Already present; verify | Trunk has agent-scoped chat lookup and runtime binding workspace metadata. AUR-116/AUR-117 should confirm collision and stale-write behavior. |
| Web subscriptions | shared socket helpers, background subscriptions, web runtime controller | Already present; verify | Trunk includes scoped runtime subscription keys. Web refresh root-cause work remains separately blocked by AUR-117. |
| Mobile subscriptions | mobile runtime controller, background subscriptions, chat state | Already present; verify | Trunk includes branch-era mobile parity work, with later mobile docs cleanup. |
| Tests | server, Convex, shared, web, mobile runtime tests | Already present | The scoped-runtime squash added broad coverage. Later issues should run targeted health checks. |
| Docs/config | server config, operator, backend API docs | Partly superseded | Current docs were refactored after Linear planning. Branch docs should not be replayed. |
| Wrapper/worktree tooling | `parallel_prep` commits | Already present | Preserved through PRs #4, #5, and #6. AUR-118 should verify after future runtime/config changes. |
| Stable-host tooling | stable host scripts/docs/examples | Already present | Stale runtime branches would remove newer stable-host files. Preserve trunk. |

## Replay Decisions

- **Replay:** none from these branch heads as a direct branch operation.
- **Already present:** `parallel_prep`; scoped runtime and sandbox workspace
  work from `origin/pr/scoped-runtime-workspaces`.
- **Obsolete:** branch web `ChatContext.updateMessage` type narrowing; stale
  branch docs; deletion of current skills, guardrails, and stable-host docs.
- **Defer:** runtime kind extraction, config v2, provider metadata events, and
  model catalog hardening remain Linear implementation issues rather than
  branch-replay tasks.
- **Needs human decision:** whether to archive/delete `origin/agent_mode` and
  `origin/pr/scoped-runtime-workspaces` after AUR-116/AUR-117 verification.

## First Safe Next Slice

Proceed to **AUR-116 Scoped Workspace Identity Tracer**, but treat it as a
verification and hardening pass on current trunk, not as a branch replay.

The expected work is:

- Confirm current scoped identity behavior across server, Convex, shared,
  web, and mobile.
- Add or tighten tests only where current coverage misses collision cases.
- Leave wrapper, worktree, and stable-host files untouched unless the test pass
  exposes a real integration issue.

Then proceed to **AUR-117 Runtime Lifecycle Isolation Tracer** for runtime
teardown, stale-write, subscriber churn, and recovery verification.

## Verification Commands Used

Evidence commands:

```bash
git fetch --all --prune
git branch -a --format='%(refname:short) %(objectname:short) %(committerdate:short) %(subject)'
git merge-base master origin/agent_mode
git merge-base master origin/pr/scoped-runtime-workspaces
git merge-base master origin/parallel_prep
git rev-list --left-right --count master...origin/agent_mode
git rev-list --left-right --count master...origin/pr/scoped-runtime-workspaces
git rev-list --left-right --count master...origin/parallel_prep
git diff --name-status master..origin/pr/scoped-runtime-workspaces
git diff --stat master..origin/pr/scoped-runtime-workspaces
git diff --stat master..origin/agent_mode
git merge-base --is-ancestor origin/parallel_prep master
```

Repo checks after this document was added:

```bash
bun run docs:check
```
