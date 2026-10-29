# PRD: Trunk Reconciliation And Runtime Foundation

Historical. This is the source PRD for the completed "Trunk Reconciliation And
Runtime Foundation" milestone, preserved from the retired issue tracker (it was
attached to AUR-115). Issue keys are history. The outcome is recorded in
[Runtime Foundation Reconciliation Status](./reconciliation-status.md),
[Branch Reconciliation Inventory](./branch-reconciliation-inventory.md), and
[Final Runtime Foundation Verification](./final-runtime-foundation-verification.md).
Lightly condensed: the 40 user stories are grouped below.

## Milestone Key Decisions

- Do not directly merge `agent_mode` or `pr/scoped-runtime-workspaces`.
- Mine those branches and replay useful slices onto current `master`.
- Preserve current wrapper, worktree, stable-host, and operator tooling.
- Complete provider-agent config v2 before adding any new runtime.
- Extract a runtime-kind interface with Codex as the first implementation.
- Add Codex provider metadata Tier 1 before Claude/Pi/OpenCode/ACP work.
- Harden model catalog support so GPT-5.4 mini and future models do not require
  bespoke code changes.
- Fix the web refresh root cause after runtime isolation lands.

Milestone slices: branch reconciliation inventory (AUR-115), scoped workspace
identity tracer (AUR-116), runtime lifecycle isolation tracer (AUR-117),
operator tooling preservation gate (AUR-118), provider-agent config v2 tracer
(AUR-119), `KindRuntime` Codex extraction (AUR-120), Codex provider event
Tier 1 (AUR-121), model catalog hardening (AUR-122), web refresh root-cause fix
(AUR-123), docs reconciliation (AUR-124), final verification gate (AUR-125).

## Problem Statement

Agentchat had valuable work split across multiple branches, tracker issues, and
repository docs. `master` held important wrapper, stable-host, operator, and
tooling work. The `agent_mode` and `pr/scoped-runtime-workspaces` branches held
substantial runtime and workspace isolation work that should not be lost, but
they diverged from `master` before the newer wrapper and stable-host work
landed.

The project needed a safe, deliberate path to reconcile those branches,
preserve the useful implementation work, complete pending architectural
transitions, and leave Agentchat on a stable trunk for future runtime
expansion. Directly merging risked stale assumptions, conflicting
implementation details, or partially obsolete changes. Ignoring the branches
risked losing runtime hardening.

Agentchat was also mid-transition from a provider-centric configuration model
to an agent-centric runtime model. The docs identified the provider-agent merge
as the next architectural gate before new runtimes. Pending work included Codex
metadata enrichment, Claude Code runtime support, ACP-compatible clients,
GPT-5.4 mini / model catalog support, and a random web refresh bug.

## Solution

Avoid a direct branch merge. Inventory and classify the runtime and workspace
isolation work from `agent_mode` and `pr/scoped-runtime-workspaces`, then replay
useful parts onto current `master` in reviewable slices. After trunk
reconciliation, complete the provider-agent merge so each agent owns its
runtime configuration. Keep Codex as the first active runtime, enriched with a
provider-native metadata lane before any new runtime is added.

Intended outputs:

- a reconciled trunk that keeps scoped runtime and workspace isolation
- a config model where agents carry inline runtime configuration
- a runtime abstraction ready for Codex, Pi, OpenCode, and Claude Code without
  exposing runtime as a user-facing provider concept
- a richer Codex metadata/event foundation for diagnostics, replay, and future
  runtime parity
- model catalog behavior that needs no bespoke code per new model
- a fix for the web refresh bug that could wipe draft input
- updated docs and verification evidence for the final trunk state

## User Stories (grouped)

- **Maintainers:** inventory every branch with useful work; group changes by
  functional slice; call out stale assumptions; replay runtime and workspace
  isolation onto current `master` with focused tests per slice; keep a
  reconciliation document explaining what was kept, changed, or dropped; keep
  CI validating repo policy, types, lint, and tests; keep manual wrapper and
  host guardrails; update docs to the final trunk behavior; end with a
  release-hardening gate.
- **Operators:** wrapper workflow (setup, status, doctor, dev, stop, worktree
  helpers) and stable-host tooling stay intact; checkout topology risks
  (ambiguous detached or local-path Git state on the stable host) are documented
  and resolved; agents own their runtime configuration; provider IDs leave the
  user-facing config model; Codex model discovery is scoped to an agent
  runtime; validation rejects unknown runtime kinds; v1 to v2 config migration
  is explicit; diagnostics show runtime metadata without exposing unstable
  details.
- **Users:** conversations stay agent-scoped; active runs continue across
  conversation or client switches; concurrent runs across conversations and
  agents stay isolated; reconnects recover from persisted backend state; web and
  mobile observe the same runtime model; web chat stops randomly refreshing and
  losing drafts; model and variant choices are available before the first
  message and lock after it; existing message streaming keeps working while
  metadata is added.
- **Developers:** a `KindRuntime` abstraction shares lifecycle, persistence, and
  WebSocket behavior, with Codex first and runtime lifecycle separated from
  Codex protocol handling; the model catalog keeps useful provider-native
  metadata and accepts new models via live discovery or config; Codex passive
  metadata (thread, turn, token, model) and structured provider events are
  captured and persisted, separate from assistant text; Codex Tier 1 lands
  before Claude Code so Claude targets the same event architecture; Claude Code
  and ACP clients wait for the runtime foundation.

## Implementation Decisions

- Do not directly merge `agent_mode` or `pr/scoped-runtime-workspaces` into
  `master`. Treat `parallel_prep` as already merged unless the inventory finds
  missed commits.
- Create the branch reconciliation inventory before any code replay. Classify
  branch work into: workspace identity, sandbox path handling, runtime
  lifecycle, runtime persistence, Convex ingress, web subscriptions, mobile
  subscriptions, tests, docs, and config.
- Replay useful runtime and workspace isolation changes in small pull requests.
  Preserve current wrapper, worktree, stable-host, and operator tooling.
  Resolve conflicts in favor of the documented product direction in
  `docs/agentchat/`.
- Complete the provider-agent merge before adding any new runtime kind: runtime
  config moves inline under each agent; top-level provider config stops being a
  user-facing concept; model and variant selection stay user-facing; model
  discovery and caching are scoped by agent/runtime.
- Extract a runtime-kind interface that hides protocol details behind a common
  lifecycle, with Codex as the first implementation.
- Add a provider metadata/event lane instead of overloading assistant message or
  status text. Preserve existing normalized runtime WebSocket events. Persist
  provider-native events or selected metadata needed for replay and diagnostics.
  Codex metadata Tier 1 before Tier 2 artifacts or interactive approvals;
  approval flows beyond auto-approve are out of scope.
- Harden model catalog handling so new model IDs flow through live discovery or
  config, fixing GPT-5.4 mini support.
- Investigate the web refresh bug after client/runtime state reconciliation,
  since subscription churn or auth/session behavior may be related.
- Keep CI and manual guardrails focused on confidence, not deployment
  automation. Update docs after implementation decisions are final.

## Testing Decisions

- Assert external behavior and durable contracts, not private details. Each
  replay slice proves the salvaged behavior still works on current trunk.
- Runtime/workspace isolation: identity scoping, sandbox path validation,
  workspace cleanup, runtime reuse, teardown, stale state recovery.
- Convex: user-scoped authorization, chat scoping, runtime ingress, runtime
  bindings, message/run persistence.
- Web: runtime subscriptions, conversation state sync, model/variant selection,
  message rendering, and non-refresh behavior where feasible. Mobile: matching
  subscription and chat state behavior where web behavior has mobile
  equivalents.
- Server: config validation, runtime manager dispatch, Codex lifecycle, model
  catalog fallback, socket protocol compatibility. Shared packages: runtime
  event types, conversation activity helpers, persistence adapters,
  model/variant helpers.
- Keep docs and env checks in verification (architecture and config shape
  change). Run existing health commands per modified surface; `verify:ci` is the
  final always-on gate; run manual wrapper/host guardrails when those surfaces
  change; run live runtime smoke tests before declaring the foundation complete.

## Out Of Scope

- Claude Code, Pi, or OpenCode runtime implementations before the provider-agent
  merge and Codex metadata Tier 1.
- ACP-compatible clients before the runtime abstraction is stable.
- Admin UI for agent or runtime management.
- Billing, analytics, hosted-product behavior, or browser-local data modes.
- Attachments; conversation branching or forking.
- Approval UI beyond current auto-approve behavior.
- Codex Tier 2 artifact UI unless Tier 1 finished early and scope was expanded.
- Rewriting stable-host tooling beyond preserving behavior and resolving the
  known topology risk.
- Changing the product from agent-centric to model-centric.

## Further Notes

The strongest sequencing constraint was that new runtimes must wait: adding
Claude, Pi, OpenCode, or ACP first would multiply integration debt.

`agent_mode` appeared to hold the richest runtime/workspace isolation work but
diverged before later wrapper and stable-host work, so it was to be mined, not
merged. `pr/scoped-runtime-workspaces` was the smaller comparison point for
finding the minimum useful subset.

Tracker items this PRD absorbed: Codex structured provider metadata (AUR-9),
Claude Code stream-json runtime (AUR-10), ACP-compatible clients (AUR-35),
GPT-5.4 mini support (AUR-34), random web refresh (AUR-5), CI runner move
(AUR-7), stable checkout local-path origin and detached `FETCH_HEAD` state
(AUR-8), and parallelization (AUR-6).
