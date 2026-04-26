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

## Next Phase: Multi-Runtime Support

After the foundation verification gate, Agentchat can add runtime kinds beyond
Codex.

Planned runtimes in priority order:

### 1. Pi (stdin/stdout RPC)

Pi is an AI agent toolkit with a built-in coding agent and multi-provider LLM support. Its RPC mode over stdin/stdout is nearly identical to the existing Codex app-server pattern. This is the lowest-friction addition.

See [Pi Runtime Spec](./pi-runtime-spec.md).

### 2. OpenCode (HTTP REST API)

OpenCode is an open-source, provider-agnostic coding agent with a dedicated HTTP server mode. It introduces a different transport (HTTP vs pipes) but has a well-documented API with a generated SDK.

See [OpenCode Runtime Spec](./opencode-runtime-spec.md).

### 3. Claude Code (subprocess per turn)

Claude Code is Anthropic's CLI coding agent. Users with a Claude subscription can use it at no additional API cost. Integration uses the CLI binary in print mode with session resumption. This is the least clean integration but the most attractive for users already paying for a Claude subscription.

See [Claude Code Runtime Spec](./claude-code-runtime-spec.md).

## Deferred Work

These remain intentionally out of scope for the current and next phases:

- admin UI for provider and agent management
- approval flows beyond auto-approve
- ACP-compatible clients
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
