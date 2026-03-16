# Agentchat Runtime And Auth State

This document describes the current runtime and auth model in Agentchat.

Use it when you need the shortest accurate reference for how these features work today.
Use the other docs for adjacent detail:

- [Product Rules](./product-rules.md) for product constraints
- [Roadmap](./roadmap.md) for ongoing priorities
- [Testing Plan](./testing-plan.md) for confidence commands and validation strategy
- [Manual QA Checklist](./manual-qa-checklist.md) for the deliberate manual pass

## Runtime

Agentchat uses a backend-owned runtime model.

- `apps/server` owns live provider execution, websocket fanout, and transient in-memory recovery state.
- Convex owns durable identity, conversations, messages, runs, run events, and runtime bindings.
- Web and mobile are observers and input surfaces, not execution owners.

Current runtime behavior:

- accepted sends become backend-owned runs
- runs are user-scoped
- runs can continue with zero active clients
- multiple clients for the same user can observe the same run concurrently
- one user can have active runs in multiple conversations and multiple agents at the same time
- reconnecting clients recover from backend memory plus Convex persistence rather than restarting execution
- per-thread runtime activity and per-agent activity counts are derived from backend-owned state, not per-client inference

## Auth

Agentchat uses provider-oriented auth.

Current auth providers:

- `google`
- `local`

Current auth behavior:

- every accepted request resolves to a concrete Convex user
- backend session tokens resolve to a concrete Convex user and stay user-scoped through websocket runtime commands
- local auth is a real Convex-backed password path, not a shared-user fallback
- web and mobile both expose local login when the active auth provider kind is `local`
- seeded local users such as `smoke_1` and `smoke_2` are the standard local testing and operator fixtures

## Required Invariants

These are the rules the current implementation depends on:

- runtime state must never cross user boundaries
- local or LAN usage is still multi-user usage, not shared-user usage
- the backend may continue execution without active clients, but never without a user owner
- clients may observe many runs, but they do not own them
- runtime bindings, subscriptions, and persistence remain user-scoped

## Current Residual Work

The remaining work in this area is hardening and polish, not a model migration.

- keep improving deterministic and live confidence coverage
- keep operator diagnostics explicit when config, environment, or model discovery degrade
- keep mobile and web aligned as clients of the same runtime model
- keep workspace-level activity and recovery UX polished without reintroducing client-owned runtime assumptions
