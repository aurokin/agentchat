# Agentchat Runtime Confidence Implementation Plan

## Purpose

Implement the next major work in the currently recommended order:

1. expand live runtime confidence coverage
2. harden cross-client runtime behavior and recovery UX
3. continue operator hardening
4. finish provider-native Codex event mapping
5. validate live Codex model and variant behavior
6. finish mobile parity and platform validation

This plan is intended to be updated as work lands. Keep it current alongside code changes, commits, and pushes.

## Verified Starting Point

Based on the current repository state:

- backend-owned runtime behavior is already implemented across web, mobile, server, and Convex
- local auth is already a real Convex-backed user path
- seeded smoke users (`smoke_1`, `smoke_2`) already exist and are the normal local multi-user fixtures
- live runtime, browser-confidence, operator, and diagnostics scripts already exist
- `assistant_status` and `message.started` support already exist end to end
- the biggest remaining gaps are confidence coverage, edge-case hardening, diagnostics depth, event-model completeness, and mobile polish/validation

## Operating Rules

- Always leave room for refactoring as new behavior becomes clearer.
- Every phase must increase test coverage, not just implementation surface.
- Prefer tightening existing abstractions over adding one-off fixes.
- Keep docs, this plan, and any operator-facing commands in sync with code changes.
- After each meaningful milestone:
    - update this plan with status and findings
    - commit with hooks enabled
    - push the branch

## Status Legend

- `pending`: not started
- `in_progress`: active work
- `blocked`: waiting on a decision or dependency
- `done`: merged or otherwise fully landed on the active branch

## Workstreams

### Phase 1. Expand Live Runtime Confidence Coverage

Status: `in_progress`

Goal:

- make the current runtime model cheaper to trust under real local Codex usage

Primary surfaces:

- `scripts/testing/`
- `apps/server/src/__tests__/`
- `apps/web/src/components/chat/__tests__/`
- `apps/mobile/src/components/chat/__tests__/`
- `packages/convex/convex/__tests__/`

Core tasks:

- extend live/manual confidence coverage for:
    - zero-client continuation and reconnect
    - same-user multi-client observation
    - multi-conversation concurrency
    - multi-agent concurrency
    - multi-user isolation
    - stale runtime binding recovery
    - browser-visible runtime-state regressions
    - long streamed assistant responses that change shape during a turn
    - LAN browser reachability and bootstrap/socket behavior
- add or improve deterministic replay fixtures for failure-injection and event-order coverage where live Codex turns are not required
- keep manual commands token-efficient and explicit rather than automatic-on-push

Refactoring and test budget:

- simplify duplicated test helpers before adding more scenarios
- normalize runtime replay fixture helpers if coverage starts fragmenting
- promote repeated browser/runtime assertions into reusable helpers

Exit criteria:

- the confidence suite covers the main backend-owned runtime invariants already described in docs
- replay fixtures exist for the most failure-prone ordering and recovery cases
- new tests reduce the need for ad hoc manual spot checks

### Phase 2. Harden Cross-Client Runtime Behavior And Recovery UX

Status: `pending`

Goal:

- make web and mobile behave consistently under active-run edge cases

Primary surfaces:

- `apps/web/src/components/chat/`
- `apps/web/src/contexts/`
- `apps/mobile/src/components/chat/`
- `apps/mobile/src/contexts/`
- `packages/shared/src/core/`
- `packages/convex/convex/runtimeBindings.ts`

Core tasks:

- audit client handling for:
    - send-in-flight conversation switches
    - send-in-flight agent switches
    - stale stop button recovery
    - reconnect-banner gating
    - active-run recovery after refresh or reconnect
    - conversation-list and workspace-level activity consistency
- improve higher-level workspace activity/navigation above individual conversation lists
- remove any remaining current-screen ownership assumptions from client code

Refactoring and test budget:

- consolidate overlapping runtime helper logic between web and mobile where shared behavior is drifting
- trim client-only inference that duplicates Convex-derived runtime state
- add targeted controller/helper tests before and after each behavioral fix

Exit criteria:

- web and mobile match the documented backend-owned runtime model in the common failure paths
- workspace activity state is consistent with Convex-derived state
- stale UI controls are covered by regression tests

### Phase 3. Continue Operator Hardening

Status: `pending`

Goal:

- make the local/self-hosted operator path more observable and less fragile

Primary surfaces:

- `apps/server/src/config.ts`
- `apps/server/src/configDiagnostics.ts`
- `apps/server/src/doctorReport.ts`
- `apps/server/src/http.ts`
- `scripts/testing/config-reload-smoke.ts`
- `scripts/testing/operator-failure-smoke.ts`
- `scripts/testing/doctor-env-smoke.ts`
- `docs/agentchat/operator-guide.md`

Core tasks:

- improve readiness and remediation detail in server diagnostics
- tighten last-known-good config behavior during reload failures
- verify disabled provider/agent fallback behavior stays explicit and safe
- add more low-token operator smoke checks where helpful
- keep diagnostics aligned between `/api/diagnostics`, `doctor:server`, and browser-visible operator behavior

Refactoring and test budget:

- centralize duplicated config-diagnostic issue mapping
- keep doctor output and JSON output derived from the same underlying issue model
- add tests whenever a new operator-facing failure mode is documented

Exit criteria:

- operators can quickly distinguish config, environment, provider, and workspace-path failures
- invalid config reloads never silently degrade into misleading runtime behavior
- operator docs match what the diagnostics actually surface

### Phase 4. Finish Provider-Native Codex Event Mapping

Status: `pending`

Goal:

- rely on real Codex event structure for transcript items wherever available

Primary surfaces:

- `apps/server/src/codexRuntime.ts`
- `apps/server/src/socketProtocol.ts`
- `apps/server/src/runtimePersistence.ts`
- `packages/convex/convex/runtimeIngress.ts`
- `packages/shared/src/core/agentchat-socket.ts`
- client message rendering in web and mobile

Core tasks:

- map more provider-native runtime items directly instead of depending on transcript heuristics
- keep progress/status items first-class when Codex emits typed events
- separate transcript structure correctness from formatting cleanup
- verify persistence ordering and message-boundary behavior for multi-message runs

Refactoring and test budget:

- split Codex event normalization from persistence side effects when that improves clarity
- extend server and replay tests before adding new event mappings
- keep client message rendering tolerant of richer runtime item sequences

Exit criteria:

- multi-message output boundaries are driven by real Codex events wherever available
- persisted run events and transcript rows stay consistent for status-to-output transitions
- live and deterministic tests cover the added event types

### Phase 5. Validate Live Codex Model And Variant Behavior

Status: `pending`

Goal:

- make provider/model/variant behavior trustworthy in the real product path

Primary surfaces:

- `apps/server/src/codexModelCatalog.ts`
- `apps/server/src/codexRuntime.ts`
- `apps/server/src/doctor.ts`
- `scripts/testing/live-runtime-smoke.ts`
- web and mobile settings/model selection helpers

Core tasks:

- verify model catalog freshness and fallback behavior
- validate variant mapping in real local Codex turns
- investigate Codex Spark specifically and document the result
- make operator-facing diagnostics clearer when model discovery or variant use is degraded

Refactoring and test budget:

- simplify model/variant selection logic if live validation exposes drift between server defaults and client assumptions
- increase confidence coverage for provider/model/variant locking behavior
- keep shared settings helpers aligned between web and mobile

Exit criteria:

- supported model and variant options are accurate in bootstrap and agent-option flows
- the live path for the currently supported Codex variants is documented and covered
- any unsupported or degraded Codex variant behavior is explicit in docs and diagnostics

### Phase 6. Finish Mobile Parity And Platform Validation

Status: `pending`

Goal:

- treat mobile as a first-class subscriber of the same runtime model, then close the remaining UX gap

Primary surfaces:

- `apps/mobile/app/`
- `apps/mobile/src/components/`
- `apps/mobile/src/contexts/`
- `docs/agentchat/mobile-followup.md`
- `docs/agentchat/mobile-integration-testing.md`

Core tasks:

- finish parity on the current runtime/auth path
- validate Android physical-device behavior against the LAN dev-client plus local server flow
- keep iPhone development-build testing aligned with the same backend/session/runtime path
- revisit the mobile top app bar and remaining chat-flow polish issues

Refactoring and test budget:

- reduce mobile-only runtime assumptions where web and mobile should share behavior
- keep adding targeted mobile confidence tests for controller and settings behavior
- document any host-platform-specific limitations instead of leaving them implicit

Exit criteria:

- mobile behavior matches web on the supported runtime/auth path
- Android and iPhone manual validation steps are clear and repeatable
- the remaining mobile-specific follow-up list is small and UI-focused rather than architectural

## Cross-Cutting Expectations

These apply in every phase:

- update docs when behavior or operator workflows change
- update this plan with:
    - status
    - landed scope
    - notable findings
    - follow-up items
- increase deterministic coverage whenever a live/manual failure teaches us something reusable
- prefer removing obsolete code paths rather than documenting around them forever

## Suggested Milestone Update Template

Use this block when updating the plan after a commit or push:

```md
### Update YYYY-MM-DD

- Phase: `...`
- Status: `pending|in_progress|blocked|done`
- Landed:
    - ...
- Refactors:
    - ...
- Tests added or updated:
    - ...
- Docs updated:
    - ...
- Commit / push:
    - commit: `...`
    - push: `...`
- Next step:
    - ...
```

### Update 2026-03-16

- Phase: `Phase 1. Expand Live Runtime Confidence Coverage`
- Status: `in_progress`
- Landed:
    - roadmap and product docs were updated to match the shipped runtime/auth model
    - the runtime-confidence implementation plan was added under `plans/`
- Refactors:
    - none yet in this phase
- Tests added or updated:
    - documentation integrity was rechecked after the roadmap/auth doc sweep
- Docs updated:
    - `README.md`
    - `docs/agentchat/backend-api-spec.md`
    - `docs/agentchat/manual-qa-checklist.md`
    - `docs/agentchat/roadmap.md`
    - `docs/agentchat/runtime-and-auth-plan.md`
    - `docs/agentchat/testing-plan.md`
- Commit / push:
    - commit: `fbf1d6c`
    - push: `origin/master`
- Next step:
    - land additional Phase 1 confidence coverage starting with the browser long-stream markdown scenario

### Update 2026-03-16

- Phase: `Phase 1. Expand Live Runtime Confidence Coverage`
- Status: `in_progress`
- Landed:
    - `web-browser-confidence` now includes a scripted `long-stream` scenario for local-auth browser confidence work
    - the default `full` browser-confidence mode now covers smoke, interrupt, refresh, and long-stream markdown rendering
    - runtime replay analysis now validates `previousMessageId` and `previousKind` across multi-message assistant transitions
    - shared transcript text normalization now inserts paragraph breaks before markdown headings when prose runs into structured markdown
- Refactors:
    - browser-confidence gained reusable helpers for locating the latest assistant message and waiting for streamed content length
    - runtime replay validation now tracks prior message kinds instead of only message ids and content
- Tests added or updated:
    - `scripts/testing/__tests__/browser-confidence-helpers.test.ts`
    - `scripts/testing/__tests__/runtime-replay-helpers.test.ts`
    - `packages/shared/src/core/__tests__/text.test.ts`
    - `bun run test:scripts`
    - `bun run --cwd packages/shared test`
- Docs updated:
    - `docs/agentchat/operator-guide.md`
    - `docs/agentchat/roadmap.md`
    - `docs/agentchat/testing-plan.md`
- Commit / push:
    - commit: `e57aab4`
    - push: `origin/master`
    - commit: `ba14a13`
    - push: `origin/master`
    - commit: `d6990b5`
    - push: `origin/master`
- Next step:
    - add the next Phase 1 confidence slice around LAN/browser reachability or another deterministic regression for cross-client recovery behavior

### Update 2026-03-16

- Phase: `Phase 1. Expand Live Runtime Confidence Coverage`
- Status: `in_progress`
- Landed:
    - shared socket coverage now verifies that active conversation subscriptions are replayed after an unexpected reconnect
    - web LAN browser URL rewriting now covers IPv4 loopback, IPv6 loopback, and path-preserving rewrites for non-loopback browser hosts
    - the web client now correctly rewrites bracketed IPv6 loopback backend URLs such as `http://[::1]:3030`
- Refactors:
    - none beyond the targeted recovery and LAN confidence fixes
- Tests added or updated:
    - `packages/shared/src/core/__tests__/agentchat-socket.test.ts`
    - `apps/web/src/lib/__tests__/agentchat-server.test.ts`
    - `bun run --cwd packages/shared test`
    - `bun run --cwd apps/web test:confidence`
- Docs updated:
    - plan progress only in this milestone
- Commit / push:
    - commit: `337530b`
    - push: `origin/master`
    - commit: `963a138`
    - push: `origin/master`
- Next step:
    - continue Phase 1 with either a browser/LAN-specific manual confidence script addition or another deterministic regression around cross-client recovery state

### Update 2026-03-16

- Phase: `Phase 1. Expand Live Runtime Confidence Coverage`
- Status: `in_progress`
- Landed:
    - added a dedicated manual LAN browser confidence command: `bun run test:manual:web-lan-confidence`
    - moved the LAN host setting into a gitignored local JSON config: `scripts/testing/web-lan-confidence.local.json`
    - added a tracked example config so setup stays discoverable without storing host-specific details in git
- Refactors:
    - kept the LAN path as a thin wrapper over the existing browser-confidence flow instead of cloning the underlying Playwright logic
- Tests added or updated:
    - `scripts/testing/__tests__/web-lan-confidence-helpers.test.ts`
    - `bun run test:scripts`
    - `bun run docs:check`
- Docs updated:
    - `docs/agentchat/manual-qa-checklist.md`
    - `docs/agentchat/operator-guide.md`
    - `docs/agentchat/roadmap.md`
    - `docs/agentchat/testing-plan.md`
- Commit / push:
    - commit: `3e52254`
    - push: `origin/master`
- Next step:
    - choose the next Phase 1 slice between broader LAN/browser runtime assertions and another deterministic cross-client recovery regression

### Update 2026-03-16

- Phase: `Phase 1. Expand Live Runtime Confidence Coverage`
- Status: `in_progress`
- Landed:
    - shared runtime recovery now treats persisted `recovering` snapshots as resumable active runs instead of dropping them on client reload
    - web runtime synchronization now restores the active run UI when the current chat reconnects into a persisted `recovering` state
    - mobile runtime synchronization now restores the active run UI for the same persisted `recovering` state path
- Refactors:
    - kept the runtime recovery rule centralized in `packages/shared` so web and mobile continue to share the same active-run reconstruction logic
- Tests added or updated:
    - `apps/web/src/components/chat/__tests__/conversation-runtime-helpers.test.ts`
    - `apps/web/src/components/chat/__tests__/conversation-runtime-controller.test.ts`
    - `apps/mobile/src/components/chat/__tests__/conversation-runtime-controller.test.ts`
    - `bun run --cwd packages/shared test`
    - `bun run --cwd apps/web test:confidence`
    - `bun run --cwd apps/mobile test:confidence`
- Docs updated:
    - plan progress only in this milestone
- Commit / push:
    - commit: `30cd9f0`
    - push: `origin/master`
- Next step:
    - keep Phase 1 focused on another deterministic recovery invariant, most likely around stale run handoff or cross-client recovery after conversation switches

### Update 2026-03-16

- Phase: `Phase 1. Expand Live Runtime Confidence Coverage`
- Status: `in_progress`
- Landed:
    - web runtime sync now resets and recovers when the current chat's authoritative persisted run has moved to a different assistant message
    - mobile runtime sync now applies the same authoritative run handoff behavior for same-chat recovery
    - same-chat stale local runs no longer survive when Convex runtime state points at a newer run in the same conversation
- Refactors:
    - centralized the shared reset decision in `packages/shared/src/core/conversation-runtime.ts` so web and mobile follow one runtime-snapshot compatibility rule
    - extracted a shared live-runtime predicate to remove duplicated `active`/`recovering` phase checks
- Tests added or updated:
    - `packages/shared/src/core/__tests__/conversation-runtime.test.ts`
    - `apps/web/src/components/chat/__tests__/conversation-runtime-controller.test.ts`
    - `apps/mobile/src/components/chat/__tests__/conversation-runtime-controller.test.ts`
    - `bun run --cwd packages/shared test`
    - `bun run --cwd apps/web test:confidence`
    - `bun run --cwd apps/mobile test:confidence`
- Docs updated:
    - plan progress only in this milestone
- Commit / push:
    - commit: `db71ad4`
    - push: `origin/master`
- Next step:
    - inspect the remaining recovery path around whether an active local run should be upgraded from `runId: null` to an authoritative persisted `runId` without waiting for fresh socket events

### Update 2026-03-16

- Phase: `Phase 1. Expand Live Runtime Confidence Coverage`
- Status: `in_progress`
- Landed:
    - web runtime sync now upgrades a same-chat active run from `runId: null` to the authoritative persisted `runId` without forcing a reset
    - mobile runtime sync now applies the same non-reset `runId` hydration behavior
    - local active runs keep their in-memory content while gaining the authoritative `runId`, reducing ambiguity for later runtime events
- Refactors:
    - added a shared active-run synchronization helper in `packages/shared/src/core/conversation-runtime.ts` so web and mobile enrich local runs through one code path
- Tests added or updated:
    - `packages/shared/src/core/__tests__/conversation-runtime.test.ts`
    - `apps/web/src/components/chat/__tests__/conversation-runtime-controller.test.ts`
    - `apps/mobile/src/components/chat/__tests__/conversation-runtime-controller.test.ts`
    - `bun run --cwd packages/shared test`
    - `bun run --cwd apps/web test:confidence`
    - `bun run --cwd apps/mobile test:confidence`
- Docs updated:
    - plan progress only in this milestone
- Commit / push:
    - commit: `2c8e11f`
    - push: `origin/master`
- Next step:
    - inspect the remaining Phase 1 recovery edges around interrupted runs, reconnect notices, and browser-visible recovery state after a local reset

### Update 2026-03-16

- Phase: `Phase 1. Expand Live Runtime Confidence Coverage`
- Status: `in_progress`
- Landed:
    - extracted web runtime display phase mapping so reconnect-driven recovery state is represented through a single helper instead of ad hoc JSX logic
    - added explicit browser-visible coverage for recovering, interrupted, and already-recovering runtime banner states
    - wired the new display-state test into `apps/web`'s curated `test:confidence` command so it stays in the normal confidence loop
- Refactors:
    - `ChatWindow` now derives its display runtime state through `resolveDisplayedRuntimeState`
- Tests added or updated:
    - `apps/web/src/components/chat/__tests__/conversation-runtime-display.test.ts`
    - `bun run --cwd apps/web test:confidence`
- Docs updated:
    - plan progress only in this milestone
- Commit / push:
    - commit: `ef812b7`
    - push: `origin/master`
- Next step:
    - decide whether the remaining reconnect-notice edge warrants extracting a pure sync/notice-state helper from `useConversationRuntime` for direct unit coverage

### Update 2026-03-16

- Phase: `Phase 1. Expand Live Runtime Confidence Coverage`
- Status: `in_progress`
- Landed:
    - web runtime sync now keeps a pending reconnect notice through one post-reset grace pass instead of clearing it immediately on the first idle or terminal snapshot
    - recovered runs still consume the reconnect notice immediately once the browser can display the recovered state
    - terminal runtime states without a reset continue to clear stale reconnect notices so banners do not linger indefinitely
- Refactors:
    - extracted a web runtime-sync helper to make reconnect-notice clearing rules explicit and directly testable
- Tests added or updated:
    - `apps/web/src/components/chat/__tests__/conversation-runtime-sync.test.ts`
    - `bun run --cwd apps/web test:confidence`
- Docs updated:
    - plan progress only in this milestone
- Commit / push:
    - commit: `c7bfd79`
    - push: `origin/master`
- Next step:
    - decide whether the next highest-leverage Phase 1 slice is a hook-level runtime-sync unit harness or a manual/browser flow that exercises the reconnect notice end to end

### Update 2026-03-16

- Phase: `Phase 1. Expand Live Runtime Confidence Coverage`
- Status: `in_progress`
- Landed:
    - extracted a hook-level runtime-sync planning helper for `useConversationRuntime`, so the reconnect/recovery effect is now driven by a pure, directly testable plan
    - added targeted unit coverage for the hook planning layer around reconnect notice retention and recovered-run notice consumption
    - folded the new hook-planning test into the curated web confidence command
- Refactors:
    - `useConversationRuntime` now delegates sync-effect planning to `planConversationRuntimeSync` instead of inlining reconnect-notice and recovery decisions
- Tests added or updated:
    - `apps/web/src/components/chat/__tests__/conversation-runtime-hook.test.ts`
    - `bun run --cwd apps/web test:confidence`
- Docs updated:
    - plan progress only in this milestone
- Commit / push:
    - commit: `74282a3`
    - push: `origin/master`
- Next step:
    - choose between expanding the hook harness deeper into socket-event handling or switching back to a browser/manual reconnect flow that validates the same behavior end to end

### Update 2026-03-16

- Phase: `Phase 1. Expand Live Runtime Confidence Coverage`
- Status: `in_progress`
- Landed:
    - extracted a pure run-lifecycle planner for the `useConversationRuntime` socket-event path, covering recovered `run.started` and terminal run handling
    - added direct unit coverage for recovered reconnect notice consumption, flushed interrupt errors on `run.started`, and terminal failure cleanup planning
    - removed an unreachable `connection.error` branch from the web hook after `tsc` confirmed it could never be produced by `resolveConversationSocketEvent`
- Refactors:
    - `useConversationRuntime` now delegates more of its socket-event state machine to `planConversationRunLifecycleResolution`
- Tests added or updated:
    - `apps/web/src/components/chat/__tests__/conversation-runtime-events.test.ts`
    - `bun run --cwd apps/web typecheck`
    - `bun run --cwd apps/web test:confidence`
- Docs updated:
    - plan progress only in this milestone
- Commit / push:
    - commit: `pending`
    - push: `pending`
- Next step:
    - keep deepening deterministic hook-level coverage, likely by extracting the remaining message event application path or by adding mobile/shared parity tests for the new recovery invariants
