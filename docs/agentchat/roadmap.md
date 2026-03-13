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
- Keep Codex-backed model and variant discovery well-tested and operator-friendly
- Improve operator-facing diagnostics and health reporting
- Build a practical testing stack around the dedicated local fixtures in `/home/auro/agents/agentchat_test`
- Keep the active roadmap narrowly focused on Codex confidence rather than adding more providers
- Use the live Convex deployment for real codegen, runtime persistence validation, and end-to-end confidence passes

## Next Milestones

### 1. Testing And Validation

- Standardize on the dedicated local test fixtures in `/home/auro/agents/agentchat_test`
  - `/home/auro/agents/agentchat_test/smoke` for ultra-cheap liveness checks
  - `/home/auro/agents/agentchat_test` for deterministic read-only functional checks
  - `/home/auro/agents/agentchat_test/workspace` for edit, interruption, and resume checks
- Add integration coverage across `apps/server`, Convex ingress, and websocket runtime flow
- Keep generated Convex bindings in sync with the live deployment before manual confidence passes
- Add browser-level end-to-end coverage for agent selection, chat send, interruption, refresh, and recovery
- Build a manual QA checklist for real Codex-backed instances
- Keep these tests manually invoked, not automatic on push

### 2. Operator Hardening

- Better error reporting for disabled agents, disabled providers, and bad server config
- Clear operator docs for custom agent setup
- Stronger runtime and recovery observability
- Low-token operator smoke checks using the dedicated test fixtures

### 3. Mobile Parity

- Continue aligning mobile UX and runtime behavior with web
- Reduce remaining mobile-specific assumptions and polish the agent-centric flow
- Validate mobile manually against the same dedicated test-agent fixtures used for web

## Later, Not V1

- Broaden the provider surface once Codex is highly confident end to end
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
