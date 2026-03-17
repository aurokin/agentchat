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
- keep model discovery well-tested and safe under degraded conditions
- keep low-token operator smoke paths current with real operator workflows

### 3. Mobile Polish

- keep mobile aligned with the same backend/session/runtime path as web
- limit remaining mobile work to platform ergonomics and UI polish, not architecture
- keep physical-device validation grounded in the same local server and Convex path used elsewhere

### 4. Provider-Native Runtime Semantics

- keep expanding provider-native runtime item mapping where it improves transcript correctness
- keep transcript structure driven by real runtime events when available
- keep formatting cleanup separate from runtime event structure

## Next Phase: Provider-Agent Merge

The current architecture separates providers and agents into distinct config-level concepts. This separation will be collapsed so that each agent carries its own runtime config inline. This change comes before any new runtime is added.

See [Provider-Agent Merge Plan](../../plans/provider-agent-merge-plan.md) for full detail.

Key outcomes:

- the top-level `providers[]` config array is removed
- each agent gets an inline `runtime` block with a `kind` discriminator
- `providerIds` and `defaultProviderId` are removed from agent config
- model and variant selection remain user-facing, sourced from the agent's runtime
- a `KindRuntime` interface is extracted from the current `CodexRuntimeManager`
- config version bumps to `2` with v1 backward compatibility during transition

## Next Phase: Multi-Runtime Support

After the provider-agent merge, Agentchat will support multiple runtime kinds beyond Codex.

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
