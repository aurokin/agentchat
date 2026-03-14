# Agentchat Testing Plan

This document records the manual, integration, and end-to-end testing strategy for Agentchat.

## Goals

- keep routine manual checks token-efficient
- validate the real web/server/Convex/Codex runtime path
- make mobile parity measurable against the same fixtures
- keep tests manual or explicitly invoked, not automatic CI

## Test Agent Fixtures

Agentchat uses a dedicated local test workspace outside the repo:

- `/home/auro/agents/agentchat_test`
    - primary deterministic read-mostly test agent
- `/home/auro/agents/agentchat_test/smoke`
    - ultra-cheap greeting smoke agent
- `/home/auro/agents/agentchat_test/workspace`
    - constrained edit agent for interruption, resume, and mutation tests

These fixtures should stay small, stable, and cheap to run.

For local setup convenience, `bun run setup:test-agent-config` writes a gitignored `apps/server/agentchat.config.json` that points at these fixtures.

## Test Layers

### 1. Manual Smoke Checks

Purpose:

- prove the stack is alive
- confirm basic auth, bootstrap, and runtime wiring

Primary fixture:

- `/home/auro/agents/agentchat_test/smoke`

Examples:

- run `bun run --cwd packages/convex codegen`
- run `bun run doctor:server`
    - confirm it reports live Codex model access for each enabled provider
- sign in if auth mode is `google`, or let the default workspace user initialize if auth mode is `disabled`
- select the smoke agent
- send a greeting
- confirm a fast concise response arrives

### 2. Manual Functional Checks

Purpose:

- validate real user flows against deterministic local content

Primary fixture:

- `/home/auro/agents/agentchat_test`

Examples:

- read and summarize `README.md`
- answer questions about `STATUS.md`
- compute values from `src/math.ts`
- confirm agent-scoped conversations remain isolated

### 3. Manual Runtime Recovery Checks

Purpose:

- validate interruption, restart, reconnect, and thread resume behavior

Primary fixture:

- `/home/auro/agents/agentchat_test/workspace`

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
- runtime persistence ingress into Convex
- generated Convex bindings validated against the live deployment
- Codex thread start/resume fallback behavior
- disabled provider / disabled agent handling
- operator diagnostics for invalid paths and fallback defaults

These tests should be manually invoked from scripts or package test commands when needed.

### 4a. Live Runtime Smoke

Purpose:

- validate the real local `apps/server` plus Convex plus Codex path with seeded data

Invocation:

- `bun run test:manual:live-runtime-smoke`
- `bun run test:manual:live-runtime-interrupt`
- `bun run test:manual:stale-runtime-resume`
- `bun run test:manual:config-reload-smoke`
- `bun run test:manual:runtime-confidence`
- `bun run test:manual:operator-failure-smoke`
- `bun run test:manual:doctor-env-smoke`

Coverage targets:

- seed a real Convex user, conversation, user message, and assistant draft
- mint a backend session token
- connect to the local websocket transport
- send a live Codex turn
- persist completed and interrupted run state back into Convex
- verify assistant message and run status after the socket flow completes
- verify a stale persisted runtime binding falls back to a fresh thread start and is replaced in Convex

Current behavior note:

- interrupted turns do not always emit text deltas before termination
- when deltas were streamed, interrupted assistant content must persist
- when no deltas were streamed, an interrupted run with empty assistant content is currently considered valid

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

- auth-disabled mode is the preferred browser-test path for local confidence work that does not specifically need the Google sign-in flow
- use `bun run test:manual:web-browser-confidence` for the real disabled-auth web chat flow
- use `bun run test:manual:web-operator-smoke` for browser-visible config hot-reload checks
- run those commands sequentially because the operator smoke mutates `apps/server/agentchat.config.json`
- Google-auth browser coverage still remains a separate manual/operator concern
- when a manual pass finds a browser-visible runtime regression, add a focused scripted check or unit regression around the exact state transition before treating it as closed

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

## Manual QA Checklist

Use [manual-qa-checklist.md](./manual-qa-checklist.md) for the explicit Codex confidence pass tied to these fixtures.

## Invocation Rule

- Do not wire these tests into automatic GitHub CI.
- Prefer explicit scripts or checklists that an operator runs intentionally.
- Keep smoke and manual functional checks cheap enough for frequent local use.

Current manual confidence command:

- `bun run test:manual:codex-confidence`
- `bun run test:manual:live-runtime-smoke`
- `bun run test:manual:live-runtime-interrupt`
- `bun run test:manual:stale-runtime-resume`
- `bun run test:manual:config-reload-smoke`
- `bun run test:manual:runtime-confidence`
- `bun run test:manual:operator-failure-smoke`
- `bun run test:manual:doctor-env-smoke`
- `bun run test:manual:web-browser-confidence`
- `bun run test:manual:web-operator-smoke`

This runs live Convex codegen, the server doctor, and the targeted server and web confidence suites without turning them into always-on checks.
It also runs the targeted mobile confidence suite for agent selection, provider/model/variant state, and runtime recovery helpers.

## Priority Order

1. Web manual smoke and functional checks using the smoke and primary fixtures
2. Web browser confidence and operator hot-reload checks in disabled-auth mode
3. Server integration coverage around websocket, persistence, and resume
4. Mobile manual parity checks against the same fixtures
5. Revisit provider-specific fixtures only after Codex is highly confident end to end
