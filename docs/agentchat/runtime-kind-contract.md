# Runtime Kind Contract

This document describes the target contract for runtime kinds as Agentchat
moves beyond Codex.

The current implementation has a `KindRuntime` boundary with Codex behind it.
The next contract revision should preserve current Codex behavior while making
room for Claude Code, ACP agents, Pi, and OpenCode.

## Product Boundary

The product model stays agent-centric:

- the user selects an agent
- the agent owns its runtime config
- the runtime owns model and variant availability
- runtime/provider/protocol details remain hidden from the user

Frontend clients should continue to consume normalized Agentchat events. They
should not learn Codex, Claude Code, ACP, Pi, or OpenCode protocol details.

## Runtime Shape

The shared contract should model a runtime as:

- an agent-scoped adapter
- a session or thread identity owned by the provider/runtime
- prompt turns started by accepted user sends
- normalized updates emitted during a turn
- recoverable binding metadata persisted in Convex
- internal provider artifacts persisted for diagnostics and replay

This is intentionally broader than a persistent process. A runtime may be:

- persistent per conversation, like Codex
- subprocess-per-turn, like Claude Code
- session-over-JSON-RPC, like ACP
- server-over-HTTP, like OpenCode

## Capabilities

Each runtime kind should expose capabilities that product code can reason
about without protocol-specific branches:

- lifecycle model: persistent session, per-turn subprocess, external server
- model catalog source: live, static, configured, or hybrid
- resumability: thread id, session id, provider storage, or none
- cancellation: cooperative command, notification, process signal, HTTP abort
- provider artifacts: lifecycle, usage, reasoning, tool, diff, plan, review
- approval behavior: auto-approve, auto-deny, unsupported
- workspace behavior: shared root or copy-on-conversation cwd

## Binding Metadata

Runtime bindings should be generic enough for more than Codex thread ids.

Common fields:

- runtime kind
- runtime config id
- status
- active run id
- provider thread id when applicable
- provider session id when applicable
- provider resume token when applicable
- adapter metadata as bounded structured data
- last error and last event timestamp
- workspace identity metadata

Specific adapters should not need schema changes for every small provider
detail. Use bounded adapter metadata for runtime-owned values that are required
for recovery but not meaningful to the product model.

## Normalized Updates

Runtime kinds should map provider output into normalized update categories:

- assistant text delta
- assistant status or reasoning
- tool call started/updated/completed
- command output
- file diff or patch artifact
- plan update
- review artifact
- approval or permission request
- user input request
- turn completed
- turn interrupted or cancelled
- turn failed

Only normalized events should reach WebSocket subscribers. Provider-native
details belong in internal provider artifacts unless there is a deliberate UI
feature for them.

## Transport Independence

Transport code should be separate from adapter semantics.

Reusable transport pieces should include:

- JSON-RPC stdio client
- JSONL subprocess stream parser
- process lifecycle and cancellation helpers
- timeout and exit handling
- stderr capture
- later HTTP streaming helpers for OpenCode if direct HTTP remains preferred

The adapter should translate protocol messages into runtime updates. The
transport should only move bytes, frame messages, and report process/stream
health.

## Compatibility Rule

Codex remains the regression anchor. Any contract revision must preserve:

- existing WebSocket event compatibility
- Convex run/message/runtime binding behavior
- model catalog behavior
- provider artifact persistence
- scoped runtime identity and workspace isolation

