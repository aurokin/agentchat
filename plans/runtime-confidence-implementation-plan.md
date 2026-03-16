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
- the implementation work is complete, and the final manual browser/device confirmation pass has now succeeded

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
- shared background runtime subscription helpers now back both clients' workspace-level socket subscriptions, with direct reconciliation and cleanup coverage
- web and mobile now derive conversation runtime state through one shared helper, reducing drift in run-summary/runtime-binding interpretation while preserving existing client confidence coverage
- mobile now matches web on queued interrupt behavior during send-in-flight pre-bind windows, including flushed interrupt error handling once `run.started` arrives
- web and mobile provider/model/variant scoping now derive from one shared settings-selection helper, with direct shared coverage for provider, model, and variant fallback behavior
- Codex model discovery now treats empty visible catalogs as degraded, falls back to configured provider metadata for client model flows, and fails provider live probes so operator diagnostics stay explicit
- live runtime smoke now resolves mode-specific variant selection and reasoning-effort mapping through pure helpers with direct script-level tests

Remaining work before sign-off:

- no remaining runtime-confidence implementation work
- keep any future follow-up limited to newly discovered UI polish or platform-specific ergonomics

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

### Final Manual Confirmation Pass

Status: `done`

Goal:

- confirm the now-shared runtime, operator, and model-selection behavior on the real browser and device matrix before closing the plan

Primary surfaces:

- Local Browser
- Remote Browser via Luma
- iPad
- iPhone
- RedMagic Astra
- `docs/agentchat/manual-qa-checklist.md`
- `docs/agentchat/mobile-followup.md`

Core tasks:

- completed on:
    - Local Browser
    - Remote Browser via Luma
    - iPad
    - iPhone
    - RedMagic Astra
- confirmed long-stream, interrupt, recovery, agent switching, and provider/model/variant selection behavior worked as expected on the real client matrix
- no manual-only runtime regressions were discovered during the final pass

Exit criteria:

- the browser and device matrix completes without architectural/runtime surprises
- any remaining follow-up is explicitly device- or UI-polish-scoped, not runtime-scoped
- the plan can be closed or replaced by a smaller polish backlog

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
