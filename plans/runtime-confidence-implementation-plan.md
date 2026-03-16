# Agentchat Runtime Confidence Implementation Plan

## Purpose

Implement the remaining work in the current recommended order:

1. expand live runtime confidence coverage
2. harden cross-client runtime behavior and recovery UX
3. continue operator hardening
4. finish provider-native Codex event mapping
5. validate live Codex model and variant behavior
6. finish mobile parity and platform validation

This document is the active forward plan. Finished milestones should be removed from the active backlog and summarized only in the current status section.

## Verified Starting Point

Based on the current repository state:

- backend-owned runtime behavior is already implemented across web, mobile, server, and Convex
- local auth is already a real Convex-backed user path
- seeded smoke users (`smoke_1`, `smoke_2`) already exist and are the normal local multi-user fixtures
- live runtime, browser-confidence, operator, and diagnostics scripts already exist
- `assistant_status` and `message.started` support already exist end to end
- the biggest remaining gaps are confidence coverage, edge-case hardening, diagnostics depth, event-model completeness, and mobile polish/validation

## Current Status

Recently completed and intentionally removed from the active backlog:

- roadmap/docs alignment with the shipped runtime and auth model
- deterministic web and mobile recovery fixes for:
    - persisted `recovering` runs
    - stale same-chat run handoff
    - `runId` hydration from authoritative runtime state
    - reconnect-notice grace-pass handling
- web planner coverage for runtime sync, run lifecycle, and message lifecycle
- mobile planner coverage for runtime sync, run lifecycle, message lifecycle, and active-run connection error handling
- manual LAN browser-confidence command and supporting config/example files
- server doctor/auth diagnostics improvements and confidence coverage
- direct server coverage for last-known-good config reload failure and recovery behavior
- shared operator issue catalog wiring across config diagnostics, doctor mapping, and smoke helpers
- shared browser/operator smoke helpers for auth-provider selection and config mutation paths
- structured `/api/diagnostics` issue-code coverage for auth, provider, and agent operator failures
- shared socket coverage for failed reconnect attempts that preserve the pending recovery signal until a real reconnect succeeds
- shared socket coverage for conversation unsubscribes that happen during reconnect gaps, so stale subscriptions are not replayed
- shared socket coverage for conversation subscriptions requested before the first socket-ready event, so initial mounts replay correctly
- shared socket coverage for explicit client close while a reconnect timer is pending, so background reconnects do not leak past teardown
- shared conversation-scoped send gating so web and mobile ignore stale send settlements after a conversation switch, and web clears pending send state when the user switches away before run binding
- web and mobile now clear transient retry/error/recovered UI state on conversation switches so one chat's local runtime state does not leak into the next chat
- web now keys the socket subscription effect by conversation id rather than the whole chat object, avoiding resubscribe churn on title/model updates, and both clients clear leftover reconnect/interrupt flags on conversation switches

Current Phase 1 focus:

- expand deterministic and replay-backed coverage where live Codex/manual flows are still the only validation path
- keep manual/browser reconnect validation deferred until the end of plan execution
- identify any remaining cross-client runtime invariant that still lacks automated coverage outside the manual flows
- extend operator/runtime confidence in `apps/server` and `scripts/testing` where unit coverage still lags the documented behavior

Immediate next candidates:

- add automated coverage around server/scripts operator confidence paths that are still only exercised manually
- keep turning last-known-good reload semantics and operator remediation paths into deterministic server/script coverage
- add deterministic coverage for any remaining runtime replay or cross-client ordering edge found during implementation
- reassess whether Phase 1 is near exit criteria and Phase 2 should become the active workstream

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
