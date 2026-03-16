# Agentchat Testing Plan

This document records the manual, integration, and end-to-end testing strategy for Agentchat.

## Goals

- keep routine manual checks token-efficient
- validate the real web/server/Convex/Codex runtime path
- make mobile parity measurable against the same fixtures
- keep tests manual or explicitly invoked, not automatic CI

## Test Agent Fixtures

Agentchat uses a dedicated local test workspace outside the repo:

- `~/agents/agentchat_test`
    - primary deterministic read-mostly test agent
- `~/agents/agentchat_test/smoke`
    - ultra-cheap greeting smoke agent
- `~/agents/agentchat_test/workspace`
    - constrained edit agent for interruption, resume, and mutation tests

These fixtures should stay small, stable, and cheap to run.

For local setup convenience, `bun run setup:test-agent-config` writes a gitignored `apps/server/agentchat.config.json` that points at these fixtures.

Portable deterministic replay fixtures now live in:

- `scripts/testing/fixtures/runtime-replay`

Use those repo-owned fixtures for CI-safe replay and failure-injection coverage when you do not need a live Codex turn.

## Test Layers

### 1. Manual Smoke Checks

Purpose:

- prove the stack is alive
- confirm basic auth, bootstrap, and runtime wiring

Primary fixture:

- `~/agents/agentchat_test/smoke`

Examples:

- run `bun run --cwd packages/convex codegen`
- run `bun run doctor:server`
    - confirm it reports live Codex model access for each enabled provider
- sign in with Google if auth provider kind is `google`
- sign in with a seeded user like `smoke_1` if auth provider kind is `local`
- run `bun run test:manual:local-auth-separation` when local auth is active
    - confirm `smoke_1` and `smoke_2` stay isolated at the Convex user, chat, message, and backend-token layers
- select the smoke agent
- send a greeting
- confirm a fast concise response arrives

### 2. Manual Functional Checks

Purpose:

- validate real user flows against deterministic local content

Primary fixture:

- `~/agents/agentchat_test`

Examples:

- read and summarize `README.md`
- answer questions about `STATUS.md`
- compute values from `src/math.ts`
- confirm agent-scoped conversations remain isolated

### 3. Manual Runtime Recovery Checks

Purpose:

- validate interruption, restart, reconnect, and thread resume behavior

Primary fixture:

- `~/agents/agentchat_test/workspace`

Examples:

- request one small edit in `notes.md`
- interrupt mid-run
- refresh/reconnect mid-run
- restart `apps/server`
- continue the conversation and verify history continuity

### 4. Integration Tests

Purpose:

- validate server/runtime behavior without requiring a browser

Coverage targets:

- backend auth token verification
- websocket send/subscribe/interrupt protocol
- websocket event passthrough from runtime subscriptions back to clients
- runtime persistence ingress into Convex
- runtime persistence client coverage for all write endpoints and null binding reads
- generated Convex bindings validated against the live deployment
- Codex thread start/resume fallback behavior
- Codex turn-start failure persistence and errored binding repair
- Codex mid-stream runtime exit handling with partial-output failure persistence
- multi-message assistant output boundaries, including `message.started`
- Codex model discovery fallback when `model/list` returns no visible models
- disabled provider / disabled agent handling
- operator diagnostics for invalid paths and fallback defaults

These tests should be manually invoked from scripts or package test commands when needed.

### 4a. Live Runtime Smoke

Purpose:

- validate the real local `apps/server` plus Convex plus Codex path with seeded data

Invocation:

- `bun run test:manual:local-auth-separation`
- `bun run test:manual:live-runtime-smoke`
- `bun run test:manual:live-runtime-zero-client`
- `bun run test:manual:live-runtime-zero-client-recover`
- `bun run test:manual:live-runtime-multi-client`
- `bun run test:manual:live-runtime-multi-conversation`
- `bun run test:manual:live-runtime-multi-agent`
- `bun run test:manual:live-runtime-multi-user`
- `bun run test:manual:live-runtime-status`
- `bun run test:manual:live-runtime-repeat`
- `bun run test:manual:live-runtime-interrupt`
- `bun run test:manual:stale-runtime-resume`
- `bun run test:manual:config-reload-smoke`
- `bun run test:manual:runtime-confidence`
- `bun run test:manual:operator-failure-smoke`
- `bun run test:manual:doctor-env-smoke`

Machine-readable output:

- append `-- --json` to any live runtime smoke command when you need a structured result artifact
- example: `bun run test:manual:live-runtime-multi-client -- --json`
- the JSON result includes start and end timestamps, duration, the selected mode, and a mode-specific summary payload
- failure JSON also includes a stable issue code and any collected failure snapshot

Coverage targets:

- seed or verify `smoke_1` and `smoke_2`
- reset both workspaces independently
- confirm each user sees only its own chats after reset
- confirm cross-user chat and message reads fail
- confirm Convex-issued backend tokens stay bound to the correct user
- seed a real Convex user, conversation, user message, and assistant draft
- mint a backend session token
- connect to the local websocket transport
- send a live Codex turn
- prove the same user can observe one live run from two clients concurrently
- prove one run continues to completion with zero active clients and later reconnects without stale active-run replay
- prove a client can reconnect after a real zero-client gap and resume the active run before completion
- prove the initiating client can disconnect after `run.started` while a second client continues receiving the live stream through completion
- prove the same user can run two conversations concurrently without runtime-state crossover
- prove the same user can run two different agents concurrently without runtime-state crossover
- prove two different authenticated users can run concurrently without runtime-state crossover
- probe whether provider-native `assistant_status` messages persist before the final assistant reply when Codex emits reasoning events
- verify mode-specific model/variant selection stays deterministic before the live manual run chooses a target
- persist completed and interrupted run state back into Convex
- verify assistant message and run status after the socket flow completes
- verify terminal runtime bindings settle to the expected persisted idle state
- verify persisted run-event timelines stay ordered and end with the expected terminal events
- verify a stale persisted runtime binding falls back to a fresh thread start and is replaced in Convex
- rerun the cheap smoke path intentionally when you need to probe transient runtime flakes

Current behavior note:

- interrupted turns do not always emit text deltas before termination
- when deltas were streamed, interrupted assistant content must persist
- when no deltas were streamed, an interrupted run with empty assistant content is currently considered valid
- persisted `message_delta` chunks are expected to remain a prefix of the final assistant content, but the final completed content can legitimately include an unflushed tail that first lands in `message_completed`

Notes:

- these commands require `apps/server` to be running locally
- they prefer the real Convex-issued backend token path
- if the deployment does not yet have `BACKEND_TOKEN_SECRET`, they can fall back to a locally signed token only when the same secret is available to `apps/server`
- treat that fallback as temporary operator convenience, not full auth-path coverage

### 5. Browser End-To-End Tests

Purpose:

- validate the real web UX against the current backend/runtime path

Coverage targets:

- agent selection
- conversation creation
- provider/model/variant selection
- send/stream/interruption
- refresh and reconnect recovery
- terminal-state control recovery so completed or interrupted runs restore the send button and clear stale stop affordances
- reconnect-banner gating so recovery UI only appears after a known disconnect/reconnect path
- long streamed assistant responses that shift from status narration into structured markdown
- agent-scoped conversation switching
- operator-visible config hot reload for disabled agents and providers
- LAN browser access, including dev-origin and backend bootstrap reachability

These should also be manually invoked, not run automatically on push.

Current local browser path:

- local auth with seeded users is the preferred browser-test path for local confidence work that does not specifically need the Google sign-in flow
- use `bun run test:manual:web-browser-confidence` for the real local-auth web chat flow
    - covers smoke, interrupt, refresh, and long-stream markdown flows
    - asserts terminal runs restore the send button and clear stale stop state
    - asserts recovery banners stay absent on ordinary flows without a known reconnect
- use `bun run test:manual:web-lan-confidence` for the separate manual LAN browser path
    - reads a gitignored local config from `scripts/testing/web-lan-confidence.local.json`
    - is meant for an explicitly configured LAN host such as `http://luma.home.arpa:4040`
    - stays outside the normal local smoke path because it depends on a manually maintained host-specific setup
- use `bun run test:manual:web-operator-smoke` for browser-visible config hot-reload checks
- run those commands sequentially because the operator smoke mutates `apps/server/agentchat.config.json`
- Google-auth browser coverage still remains a separate manual/operator concern
- current scripted reconnect-banner assertions focus on in-page websocket reconnect behavior; full page refresh checks still verify clean recovery and settled controls, but not a positive reconnect banner
- when a manual pass finds a browser-visible runtime regression, add a focused scripted check or unit regression around the exact state transition before treating it as closed
- append `-- --json` when you need machine-readable output with scenario metadata and screenshot artifact paths
- example: `bun run test:manual:web-browser-confidence -- --json`

### 6. Operator Failure Smoke

Purpose:

- verify that broken operator states are surfaced explicitly instead of failing silently

Invocation:

- `bun run test:manual:operator-failure-smoke`
- `bun run test:manual:doctor-env-smoke`

Coverage targets:

- invalid `agentchat.config.json` reload keeps the last known good config serving
- diagnostics surface the last config reload error
- missing agent `rootPath` is surfaced in diagnostics
- missing provider `codex.cwd` is surfaced in diagnostics
- missing required runtime env values are surfaced by the runtime env diagnostics

### 7. Mobile Platform Boundaries

Purpose:

- keep mobile integration work honest about what this host can actually run

Reference:

- [mobile-integration-testing.md](./mobile-integration-testing.md)

Current rule:

- Android is the preferred automation target on Linux
- iOS on Linux is manual-device testing only
- iOS simulator automation remains a macOS-only path

## Manual QA Checklist

Use [manual-qa-checklist.md](./manual-qa-checklist.md) for the explicit Codex confidence pass tied to these fixtures.

## Invocation Rule

- Do not wire the live/manual confidence commands in this document into automatic GitHub CI.
- Prefer explicit scripts or checklists that an operator runs intentionally.
- Keep smoke and manual functional checks cheap enough for frequent local use.
- The cheap always-on CI tier should stay limited to deterministic repo verification such as `bun run verify:ci`.

Current manual confidence command:

- `bun run test:manual:local-auth-separation`
- `bun run test:manual:codex-confidence`
- `bun run test:manual:live-runtime-smoke`
- `bun run test:manual:live-runtime-status`
- `bun run test:manual:live-runtime-repeat`
- `bun run test:manual:live-runtime-interrupt`
- `bun run test:manual:stale-runtime-resume`
- `bun run test:manual:config-reload-smoke`
- `bun run test:manual:runtime-confidence`
- `bun run test:manual:operator-failure-smoke`
- `bun run test:manual:doctor-env-smoke`
- `bun run test:manual:web-browser-confidence`
- `bun run test:manual:web-lan-confidence`
- `bun run test:manual:web-operator-smoke`

This runs live Convex codegen, the server doctor, and the targeted server and web confidence suites without turning them into always-on checks.
It also runs the targeted mobile confidence suite for agent selection, provider/model/variant state, and runtime recovery helpers.

## Priority Order

1. Web manual smoke and functional checks using the smoke and primary fixtures
2. Web browser confidence and operator hot-reload checks in local-auth mode
3. Server integration coverage around websocket, persistence, and resume
4. Mobile manual parity checks against the same fixtures
5. Revisit provider-specific fixtures only after Codex is highly confident end to end
