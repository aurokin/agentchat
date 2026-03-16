# Agentchat Roadmap

This roadmap describes the current state of Agentchat and the work that is still worth prioritizing.

## Current State

Agentchat already has:

- agent-centric UX in web and mobile
- server-config-driven agents and providers
- Convex-backed auth, conversations, messages, runs, run events, and runtime bindings
- backend-token auth, websocket transport, streaming, interruption, and recovery
- backend-owned runtime behavior across web, mobile, server, and Convex
- user-scoped local auth with seeded fixtures such as `smoke_1` and `smoke_2`
- multi-message assistant output with `message.started` support through server, Convex, web, and mobile
- manual live runtime, browser, LAN, operator, and stale-resume confidence commands
- targeted server, web, mobile, shared, and script coverage for the most failure-prone runtime and recovery paths
- a completed manual confirmation pass on:
    - Local Browser
    - Remote Browser via Luma
    - iPad
    - iPhone
    - RedMagic Astra

## Ongoing Priorities

### 1. Reliability And Confidence

- keep tightening end-to-end reliability across web, server, Convex, and Codex
- keep expanding deterministic regression coverage when manual or live testing teaches us something reusable
- keep the dedicated local fixtures in `~/agents/agentchat_test` as the standard confidence path

### 2. Operator Hardening

- keep diagnostics, doctor output, and config-reload behavior explicit and operator-friendly
- keep Codex-backed model discovery well-tested and safe under degraded conditions
- keep low-token operator smoke paths current with real operator workflows

### 3. Mobile Polish

- keep mobile aligned with the same backend/session/runtime path as web
- limit remaining mobile work to platform ergonomics and UI polish, not architecture
- keep physical-device validation grounded in the same local server and Convex path used elsewhere

### 4. Provider-Native Runtime Semantics

- keep expanding provider-native runtime item mapping where it improves transcript correctness
- keep transcript structure driven by real Codex events when available
- keep formatting cleanup separate from runtime event structure

## Deferred Work

These remain intentionally out of scope for the current phase:

- additional providers beyond Codex
- admin UI for provider and agent management
- approval flows beyond auto-approve
- conversation branching and forking
- hosted-product concerns such as billing or analytics

## Success Criteria

- the product stays clearly agent-centric rather than model-centric
- users remain operator-authorized and user-scoped end to end
- runs continue and recover without client ownership assumptions
- Codex remains reliable through the provider abstraction, not special-case product logic
- web and mobile continue to behave like first-class clients of the same runtime model
