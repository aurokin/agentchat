# Agentchat Roadmap

This roadmap describes the current state of Agentchat and the work that is still worth prioritizing.

## Current State

Agentchat already has:

- agent-centric UX in web and mobile
- server-config-driven agents and providers
- Convex-backed auth, conversations, messages, runs, run events, and runtime bindings
- backend-token auth, websocket transport, streaming, interruption, and recovery
- backend-owned runtime behavior across web, mobile, server, and Convex
- agent-owned inline runtime config for new Codex agents, while legacy
  top-level provider config remains as a compatibility bridge
- a `KindRuntime` interface with Codex as the active implementation
- a passive Codex provider metadata/event lane for diagnostics and replay
- a first structured provider artifact lane for Codex runtime items
- hardened model catalog behavior for GPT-5.4 mini, GPT-5.5, and future live
  model discovery
- user-scoped local auth with seeded fixtures such as `smoke_1` and `smoke_2`
- multi-message assistant output with `message.started` support through server, Convex, web, and mobile
- manual live runtime, browser, LAN, operator, and stale-resume confidence commands
- targeted server, web, mobile, shared, and script coverage for the most failure-prone runtime and recovery paths
- a wrapper-first local workflow for checkout bootstrap, status, doctor, dev, stop, and config inspection
- idempotent wrapper writes for generated local runtime files so bootstrap does
  not cause avoidable Next.js dev reloads
- disposable worktree lifecycle helpers for parallel local development
- a protected stable host install with shell-based lifecycle, smoke coverage, and systemd user-service support
- LAN HTTPS for the stable host through local Caddy, plus dormant public-hostname scaffolding and manual-only GitHub guardrail workflows
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
- keep model discovery well-tested and safe under degraded conditions
- keep low-token operator smoke paths current with real operator workflows
- finish deeper concurrent multi-worktree confidence coverage now that the wrapper and stable-host foundation is live
- keep the dormant public-hostname support documented and ready without turning it on prematurely

### 3. Mobile Polish

- keep mobile aligned with the same backend/session/runtime path as web
- limit remaining mobile work to platform ergonomics and UI polish, not architecture
- keep physical-device validation grounded in the same local server and Convex path used elsewhere

### 4. Provider-Native Runtime Semantics

- keep expanding provider-native runtime item mapping where it improves transcript correctness
- keep transcript structure driven by real runtime events when available
- keep formatting cleanup separate from runtime event structure

## Runtime Foundation Status

The provider-agent merge foundation has landed on trunk in compatibility form.
New or regenerated configs should keep `providers: []` and define
`agents[].runtime` inline. Existing provider-based configs still load through
the legacy bridge so operators do not lose work.

The active implementation keeps the public API compatible while the internal
resolution path is runtime-kind-ready:

- each new agent can carry an inline Codex runtime block
- runtime ids are unique and hidden when the owning agent is disabled or not
  visible to the current user
- `KindRuntime` provides the runtime-kind boundary, with Codex implemented first
- model discovery is scoped through the selected agent/runtime and falls back to
  configured metadata under degraded Codex model discovery
- provider terminology still appears in compatibility fields and endpoints until
  the public API is migrated in a later cleanup

See [Runtime Foundation Reconciliation Status](./reconciliation-status.md) for
the final cleanup-sweep handoff. The older
[Provider-Agent Merge Plan](../../plans/provider-agent-merge-plan.md) is now
historical context, not the active task list.

## Next Phase: Runtime Protocol Expansion

After the foundation verification gate, Agentchat can add runtime kinds beyond
Codex. This should proceed abstraction-first rather than starting with a direct
Claude-only implementation.

The next phase is tracked by the Runtime Protocol Expansion milestone and
[Runtime Protocol Expansion Plan](./runtime-protocol-expansion-plan.md).

Execution order:

1. Replan Linear and docs so implementation work follows the same graph.
2. Harden [Runtime Kind Contract](./runtime-kind-contract.md) so runtime
   execution is modeled as session-bound prompt turns with normalized updates
   and provider artifacts.
3. Add reusable runtime transports: JSON-RPC stdio, JSONL subprocess streams,
   process lifecycle helpers, cancellation, stderr, exit, and timeout handling.
4. Add [ACP Runtime Spec](./acp-runtime-spec.md) foundation for ACP
   initialization, sessions, prompt turns, updates, cancellation, and
   permission request handling.
5. Implement the Claude Code runtime tracer.
6. Implement the first ACP adapter tracer.

### Claude Code Tracer

Claude Code is Anthropic's CLI coding agent. Users with a Claude subscription
can use it at no additional API cost. Integration uses the CLI binary in print
mode with session resumption. It should be implemented after the runtime
contract and JSONL subprocess transport exist.

See [Claude Code Runtime Spec](./claude-code-runtime-spec.md).

### ACP Adapter Tracer

ACP is now part of the active runtime protocol plan. It should be implemented as
a generic protocol foundation before choosing the first concrete ACP-compatible
adapter, likely `pi-acp` unless OpenCode ACP is a better first tracer when the
foundation is ready.

See [ACP Runtime Spec](./acp-runtime-spec.md).

### Pi And OpenCode Follow-Ups

Pi and OpenCode remain planned runtime paths, but their first implementation
route should be chosen after the shared substrate exists.

- Pi can be direct stdin/stdout RPC or ACP-backed.
- OpenCode can be direct HTTP streaming or ACP-backed.

See [Pi Runtime Spec](./pi-runtime-spec.md) and
[OpenCode Runtime Spec](./opencode-runtime-spec.md).

## Deferred Work

These remain intentionally out of scope for the current and next phases:

- admin UI for provider and agent management
- approval flows beyond auto-approve
- conversation branching and forking
- hosted-product concerns such as billing or analytics
- attachments

## Success Criteria

- the product stays clearly agent-centric rather than model-centric
- users remain operator-authorized and user-scoped end to end
- runs continue and recover without client ownership assumptions
- each runtime kind is reliable through the `KindRuntime` interface, not special-case product logic
- web and mobile continue to behave like first-class clients of the same runtime model
- operators can mix runtime kinds across agents in a single instance
