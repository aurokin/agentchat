# Agentchat Roadmap

This roadmap describes the current implementation state and the next major steps for Agentchat.

## Completed Foundations

- Product direction, rules, and implementation specs under `docs/agentchat/`
- Agent-centric UX in both web and mobile
- Server-config-driven providers and agents
- Convex-backed conversations, messages, runs, run events, and runtime bindings
- Backend token auth, websocket transport, streaming, interruption, and recovery
- Codex as the first working provider
- Removal of billing, analytics, attachments, browser-local product modes, and hosted deployment assumptions

## Active Work

- Tighten end-to-end reliability across web, server, Convex, and Codex
- Close the remaining mobile parity gaps
- Replace placeholder provider model metadata with live provider-backed fetching and cache behavior
- Improve operator-facing diagnostics and health reporting

## Next Milestones

### 1. Testing And Validation

- Add integration coverage across `apps/server`, Convex ingress, and websocket runtime flow
- Add browser-level end-to-end coverage for agent selection, chat send, interruption, refresh, and recovery
- Build a manual QA checklist for real Codex-backed instances

### 2. Operator Hardening

- Better error reporting for disabled agents, disabled providers, and bad server config
- Clear operator docs for custom agent setup
- Stronger runtime and recovery observability

### 3. Mobile Parity

- Continue aligning mobile UX and runtime behavior with web
- Reduce remaining mobile-specific assumptions and polish the agent-centric flow

### 4. Provider Expansion

- Keep the provider interface stable enough for additional implementations
- Add the next providers without changing the product model

## Later, Not V1

- OpenCode support through the provider layer
- Pi Coding Agent support through the provider layer
- Pi Agent Core support through the provider layer
- Admin UI for agent and provider management
- Approval controls beyond auto-approve
- Conversation branching and forking

## Success Criteria

- The product is clearly agent-centric rather than model-centric
- Users can only access the instance if the operator allows them
- Conversations persist in Convex and reconnect cleanly
- The backend owns provider runtime communication
- Codex works through a provider abstraction rather than a special-case architecture
- Web and mobile both feel like first-class clients of the same runtime model
