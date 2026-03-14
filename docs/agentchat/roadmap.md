# Agentchat Roadmap

This roadmap describes the current implementation state and the next major steps for Agentchat.

## Completed Foundations

- Product direction, rules, and implementation specs under `docs/agentchat/`
- Agent-centric UX in both web and mobile
- Server-config-driven providers and agents
- Convex-backed conversations, messages, runs, run events, and runtime bindings
- Backend token auth, websocket transport, streaming, interruption, and recovery
- Codex as the first working provider
- Manual live runtime smoke and interrupt commands for the real local Codex plus Convex path
- Manual browser confidence coverage for the disabled-auth web flow
- Manual operator browser smoke for config hot-reload and disabled agent/provider handling
- Manual operator failure smoke for invalid config reloads, missing paths, and env diagnostics
- Manual stale-runtime-resume smoke for recoverable runtime-binding fallback
- Removal of billing, analytics, attachments, browser-local product modes, and hosted deployment assumptions

## Active Work

- Tighten end-to-end reliability across web, server, Convex, and Codex
- Close the remaining mobile parity gaps
- Keep Codex-backed model and variant discovery well-tested and operator-friendly
- Improve operator-facing diagnostics and health reporting
- Build a practical testing stack around the dedicated local fixtures in `/home/auro/agents/agentchat_test`
- Keep the active roadmap narrowly focused on Codex confidence rather than adding more providers
- Use the live Convex deployment for real codegen, runtime persistence validation, and end-to-end confidence passes
- Use disabled-auth mode aggressively for integration and browser confidence work that does not need Google sign-in coverage

## Next Milestones

### 1. Testing And Validation

- Standardize on the dedicated local test fixtures in `/home/auro/agents/agentchat_test`
    - `/home/auro/agents/agentchat_test/smoke` for ultra-cheap liveness checks
    - `/home/auro/agents/agentchat_test` for deterministic read-only functional checks
    - `/home/auro/agents/agentchat_test/workspace` for edit, interruption, and resume checks
- Add integration coverage across `apps/server`, Convex ingress, and websocket runtime flow
- Keep generated Convex bindings in sync with the live deployment before manual confidence passes
- Run `bun run test:manual:live-runtime-smoke` against a real local `apps/server` instance to verify the full Codex plus Convex persistence path
- Run `bun run test:manual:live-runtime-interrupt` to verify partial-output retention and interrupted run persistence
- Run `bun run test:manual:config-reload-smoke` to verify watched config changes disable or fallback safely without restarting the server
- Keep `bun run test:manual:runtime-confidence` as the single manual operator command for the local runtime stack
- Prefer Convex-issued backend session tokens for these live passes; allow the local signing fallback only while the deployment is still missing `BACKEND_TOKEN_SECRET`
- Add browser-level end-to-end coverage for agent selection, chat send, interruption, refresh, and recovery
- Keep the disabled-auth browser path as the primary local web confidence path
- Run `bun run test:manual:web-browser-confidence` for the real web smoke, cancel, and refresh flow
- Run `bun run test:manual:web-operator-smoke` for browser-visible agent/provider disable handling
- Keep browser E2E work honest: do not add fake auth bypasses just to automate the chat flow
- Build a manual QA checklist for real Codex-backed instances
- Keep these tests manually invoked, not automatic on push

### 2. Operator Hardening

- Better error reporting for disabled agents, disabled providers, and bad server config
- Surface last config reload failures while continuing to serve the last known good config
- Clear operator docs for custom agent setup
- Stronger runtime and recovery observability
- Low-token operator smoke checks using the dedicated test fixtures
- Verify stale runtime bindings fall back safely to a fresh Codex thread

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
