# Runtime Protocol Expansion Plan

Linear milestone: Runtime Protocol Expansion

This plan is the handoff from the completed runtime foundation into
multi-runtime work. It replaces the earlier idea of starting directly with a
Claude Code implementation.

## Problem

Agentchat now has the foundation needed for more runtimes:

- agent-owned inline runtime config
- scoped runtime identity
- Convex-backed conversations, runs, run events, and runtime bindings
- `KindRuntime` with Codex as the first implementation
- provider metadata and artifact persistence for diagnostics and replay

The next runtimes do not all fit the current Codex-shaped lifecycle.

- Codex uses a persistent JSON-RPC app-server process.
- Claude Code uses a subprocess per turn with stream-json output.
- ACP agents use JSON-RPC sessions, prompt turns, updates, cancellation, and
  permission requests.
- Pi is close to stdin/stdout RPC and may also be reachable through ACP.
- OpenCode may be direct HTTP streaming or ACP-backed.

Adding these one by one without improving the shared contract would push
adapter-specific behavior into product code.

## Direction

Runtime expansion should proceed with a thin abstraction scaffold first:

1. harden the shared runtime adapter contract only at stable seams
2. add reusable transport primitives
3. implement ACP as a generic runtime protocol foundation
4. add Claude Code as a tracer on top of the shared substrate
5. add the first ACP adapter tracer
6. revisit the abstraction after Claude and ACP create real pressure

The key abstraction is that Agentchat should model runtime execution as
session-bound prompt turns with normalized updates and provider artifacts, not
as a Codex-specific persistent process. The contract must support both
persistent conversation runtimes and per-turn subprocess runtimes. It should
not predict adapter-specific recovery state before real implementations prove
what they need.

## Key Decisions

- Runtime remains an implementation detail of the selected agent.
- Users do not select providers, runtimes, transports, or protocol families.
- ACP is part of the runtime protocol plan, not a separate afterthought.
- Claude Code should not define the shared runtime shape by itself.
- The runtime contract owns lifecycle, model catalog, cancellation, binding,
  event normalization, and artifact semantics.
- AUR-140 is a thin scaffold, not the final runtime abstraction.
- Provider artifacts and the pressure log preserve fidelity when normalized
  events are not expressive enough yet.
- Transport helpers should be reusable across adapters.
- Approval UI remains out of scope; protocol permission requests should be
  auto-resolved or fail closed according to the current auto-approve rule.
- Provider artifacts are internal diagnostics/replay data by default, not a new
  frontend surface.
- After Claude Code and the first ACP adapter exist, run a retrospective to
  revise the abstraction from real evidence.

## Execution Graph

### AUR-139 Runtime Protocol Expansion Replan

Create the canonical Linear and docs plan for this phase.

Blocks all implementation work in the milestone.

### AUR-140 KindRuntime Thin Contract Scaffold

Add only the stable contract seams before adding another runtime kind.

Expected outcomes:

- generic runtime capabilities
- support for persistent and per-turn lifecycle models
- normalized update vocabulary for text, status, tools, plans, diffs,
  completion, cancellation, and failures
- provider artifacts remain the high-fidelity escape hatch
- Codex compatibility preserved

Explicit non-goals:

- speculative Convex schema migrations
- guessed Claude/ACP binding fields
- broad thread/session renames
- lossy normalization of protocol-specific details

### AUR-141 Runtime Transport Substrate

Add reusable transport pieces.

Expected outcomes:

- JSON-RPC stdio client for Codex-like and ACP-like protocols
- JSONL subprocess stream parser for Claude Code-style output
- shared process lifecycle, stderr, exit, timeout, and cancellation helpers
- test fixtures for malformed JSON, partial lines, process exit, and
  interruption

### AUR-142 ACP Runtime Protocol Foundation

Implement the generic ACP protocol layer after the contract and substrate.

Expected outcomes:

- `initialize` and capability negotiation
- `session/new` and `session/load`
- `session/prompt`
- `session/update`
- `session/cancel`
- text, plan, tool, permission, cancellation, stop reason, and error mapping

### AUR-10 Claude Code Runtime Tracer

Implement the smallest useful Claude Code runtime after AUR-140 and AUR-141.

Expected outcomes:

- `claude --print --output-format stream-json`
- first-turn `session_id` capture
- subsequent-turn resume
- static model catalog
- normalized text/result/error/interruption events
- Claude provider artifacts persisted through the shared artifact lane
- pressure-log entries for capabilities that do not fit the scaffold

### AUR-35 ACP Adapter Tracer

Implement the first concrete ACP-compatible adapter after AUR-142.

The first target should be selected by current viability, likely `pi-acp`
unless OpenCode ACP is a better tracer at that point.

Expected outcomes:

- a concrete ACP-backed runtime path
- provider artifacts for ACP-native details
- pressure-log entries for adapter-specific friction and skipped capabilities

### AUR-143 Runtime Abstraction Retrospective

After AUR-10 and AUR-35, re-evaluate the runtime abstraction using real
implementation pressure.

Expected outcomes:

- classify pressure-log entries
- decide what stays adapter-specific
- decide what should move into the shared contract
- decide whether persistence/schema or transport substrate changes are needed
- open follow-up implementation issues
- update docs with the revised contract decisions

## ACP Reference Constraints

ACP uses JSON-RPC request/response methods and notifications. Local agents
usually communicate over stdio, while remote transports are still evolving.
The central lifecycle is initialization, session setup, prompt turns,
`session/update`, and `session/cancel`.

References:

- https://agentclientprotocol.com/protocol/overview
- https://agentclientprotocol.com/protocol/transports
- https://agentclientprotocol.com/protocol/prompt-turn

## Success Criteria

- Runtime adapters share lifecycle, cancellation, binding, event, and artifact
  concepts without losing provider fidelity.
- Claude Code can be implemented without weakening Codex or exposing runtime
  concepts in the UI.
- ACP-compatible runtimes can be added through a generic ACP client path.
- Pi and OpenCode follow-up decisions are made against the shared substrate.
- Linear and docs show the same dependency order.
- The retrospective phase revises the abstraction after real Claude/ACP
  pressure, not before it.
