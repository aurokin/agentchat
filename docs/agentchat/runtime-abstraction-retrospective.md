# Runtime Abstraction Retrospective

Linear issue: AUR-143

Date: 2026-05-01

## Purpose

This retrospective revisits the runtime abstraction after two non-Codex tracers:

- AUR-10 Claude Code runtime tracer
- AUR-35 ACP adapter tracer

The goal is to revise the contract from implementation pressure, not prediction.
The outcome is intentionally conservative: keep the shared contract thin,
promote only proven cross-adapter concepts, and leave adapter-specific fidelity
inside provider artifacts until a second runtime proves the same product need.

## Decision Summary

No broad refactor is required immediately.

The current `RuntimeKind` contract is sufficient for Codex, Claude Code, and
the generic ACP stdio adapter when paired with provider artifacts and
adapter-local recovery behavior. The retrospective does not promote a new
frontend-facing runtime concept, approval UI, ACP target profile layer, or
provider-specific tool UX.

Accepted contract clarifications:

- Treat the persisted `providerThreadId` field as a generic provider
  conversation identity in current code, even though the historical field name
  remains Codex-shaped.
- Keep provider artifacts as the required high-fidelity lane for protocol-native
  content that does not have a deliberate normalized UI surface.
- Keep cancellation as a capability family, not a single transport behavior.
  Adapters may combine cooperative cancel, process signals, and timeout
  fallback internally.
- Keep runtime model catalogs owned by runtime kinds. Static, configured, live,
  and hybrid catalogs are all valid.
- Keep stale provider identity recovery adapter-local unless multiple runtimes
  need new persisted fields.

## Pressure Classification

| Pressure | Classification | Decision |
| --- | --- | --- |
| Claude Code late `session_id` | Persistence/schema follow-up | Do not migrate now. Document `providerThreadId` as provider conversation identity and open a follow-up to rename or add a neutral field when a schema migration is already justified. |
| Claude non-text stream content | Keep adapter-specific | Preserve as provider artifacts. Do not promote shared tool UX yet. |
| Claude interrupt signal semantics | Transport substrate follow-up | Keep current `ManagedRuntimeProcess.stop()` behavior. Add signal customization only after real CLI testing proves SIGINT materially improves behavior. |
| ACP `sessionCapabilities.resume` / `close` | Explicitly defer | Keep capabilities in provider artifacts. Do not add shared lifecycle methods until a concrete ACP target needs them. |
| ACP permission requests | Explicitly defer | Keep fail-closed default and non-persistent auto-approve option. Approval UI and richer permission contracts are outside this sweep. |
| ACP elicitation, filesystem, terminal requests | Explicitly defer | Unsupported client requests should remain protocol errors until a real target requires them. |
| ACP target selection | Keep adapter-specific | Raw operator config (`command`, `args`, `mcpServers`) remains the right first shape. No typed profile layer yet. |
| ACP session load fallback | Keep adapter-specific | Fresh-session fallback heals stale persisted identities without shared schema changes. |
| ACP cancel fallback and timeout handling | Keep adapter-specific | `session/cancel` plus process-stop fallback is correct for the tracer. Promote only if another adapter needs the same knobs. |

## Contract Updates

The shared contract should continue to describe runtimes as agent-owned
session-bound prompt adapters. The contract now has enough evidence to clarify
these points:

- "Thread" and "session" are both provider conversation identities.
- A runtime may discover durable identity late and update the binding.
- A runtime may recover from stale persisted identity by opening a fresh
  provider session.
- Process cwd must default to the resolved agent/conversation workspace unless
  an operator overrides it in runtime config.
- Provider artifacts are not optional diagnostics; they are the fidelity
  mechanism for non-normalized protocol details.

## Deferred Work

The following are deliberately deferred rather than hidden:

- schema migration for neutral runtime identity field names
- provider-artifact-driven tool/plan UI
- approval UI and interactive permission decisions
- ACP resume/close lifecycle support
- ACP elicitation/filesystem/terminal client requests
- custom process signal policy for subprocess runtimes
- typed ACP target profiles

Each deferred item should become implementation work only when a product need
or a concrete adapter proves the current adapter-local behavior is insufficient.

## Follow-Up Issues

Opened follow-up issues:

- AUR-157: neutral runtime binding identity naming/schema migration
- AUR-158: optional subprocess interrupt signal policy after real CLI testing

Deferred without implementation issues:

- approval UI / permission contract
- ACP resume/close support
- ACP auxiliary client requests
- typed ACP target profiles

Those should become issues only when a product requirement or a real runtime
target proves the current adapter-local behavior is insufficient.

## Codex Compatibility

Codex remains compatible with the revised contract:

- Codex still uses a persistent session lifecycle.
- Codex provider thread ids are still valid provider conversation identities.
- Codex live model discovery remains unchanged.
- Codex normalized events and provider artifacts still flow through the same
  Convex and WebSocket paths.
- Workspace identity, runtime keys, and runtime binding behavior are unchanged.
