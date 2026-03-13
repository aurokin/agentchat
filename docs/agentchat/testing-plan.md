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
- sign in
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

### 5. Browser End-To-End Tests

Purpose:

- validate the real web UX against the current backend/runtime path

Coverage targets:

- agent selection
- conversation creation
- provider/model/variant selection
- send/stream/interruption
- refresh and reconnect recovery
- agent-scoped conversation switching

These should also be manually invoked, not run automatically on push.

## Manual QA Checklist

Use [manual-qa-checklist.md](./manual-qa-checklist.md) for the explicit Codex confidence pass tied to these fixtures.

## Invocation Rule

- Do not wire these tests into automatic GitHub CI.
- Prefer explicit scripts or checklists that an operator runs intentionally.
- Keep smoke and manual functional checks cheap enough for frequent local use.

Current manual confidence command:

- `bun run test:manual:codex-confidence`

This runs live Convex codegen, the server doctor, and the targeted server and web confidence suites without turning them into always-on checks.
It also runs the targeted mobile confidence suite for agent selection, provider/model/variant state, and runtime recovery helpers.

## Priority Order

1. Web manual smoke and functional checks using the smoke and primary fixtures
2. Server integration coverage around websocket, persistence, and resume
3. Web browser end-to-end coverage
4. Mobile manual parity checks against the same fixtures
5. Revisit provider-specific fixtures only after Codex is highly confident end to end
