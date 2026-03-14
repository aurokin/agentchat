# Agentchat Roadmap

This roadmap describes the current implementation state and the next major steps for Agentchat.

## Completed Foundations

- Product direction, rules, and implementation specs under `docs/agentchat/`
- Agent-centric UX in both web and mobile
- Server-config-driven providers and agents
- Convex-backed conversations, messages, runs, run events, and runtime bindings
- Backend token auth, websocket transport, streaming, interruption, and recovery
- Multi-message assistant run output with `message.started` support through server, Convex, web, and mobile
- Codex as the first working provider
- Manual live runtime smoke and interrupt commands for the real local Codex plus Convex path
- Manual repeated live runtime smoke for intentionally probing transient runtime flakes
- Manual browser confidence coverage for the disabled-auth web flow
- Manual operator browser smoke for config hot-reload and disabled agent/provider handling
- Manual operator failure smoke for invalid config reloads, missing paths, and env diagnostics
- Manual stale-runtime-resume smoke for recoverable runtime-binding fallback
- Server coverage for websocket command routing, persistence client endpoints, start-failure persistence, mid-stream runtime crash handling, and live terminal binding and run-event persistence checks
- Removal of billing, analytics, attachments, browser-local product modes, and hosted deployment assumptions

## Active Work

- Tighten end-to-end reliability across web, server, Convex, and Codex
- Close the remaining mobile parity gaps
- Keep Codex-backed model and variant discovery well-tested and operator-friendly
- Investigate Codex model and variant mapping in the live product path
- Remove the remaining legacy thinking-toggle assumptions so Codex model and variant selection stays direct
- Verify whether Codex Spark is functioning correctly in the current integration
- Make mobile theme default honor the device system theme correctly, especially iOS dark mode
- Refine assistant output segmentation heuristics now that one run can emit multiple assistant transcript messages
- Improve operator-facing diagnostics and health reporting
- Build a practical testing stack around the dedicated local fixtures in `/home/auro/agents/agentchat_test`
- Keep the active roadmap narrowly focused on Codex confidence rather than adding more providers
- Use the live Convex deployment for real codegen, runtime persistence validation, and end-to-end confidence passes
- Use disabled-auth mode aggressively for integration and browser confidence work that does not need Google sign-in coverage
- Use [Run Output Model Proposal](./run-output-model-proposal.md) as the source doc for further refinement of the multi-message run model
- Keep targeted regression coverage for browser-visible runtime state so manual catches like stale stop buttons and false reconnect banners stay scriptable checks
- Add regression fixtures for long streamed assistant prose formatting and LAN browser access during local development
- Keep mobile integration testing explicitly gated by host-platform support instead of implying universal simulator/device coverage

## Next Milestones

### 1. Testing And Validation

- Standardize on the dedicated local test fixtures in `/home/auro/agents/agentchat_test`
    - `/home/auro/agents/agentchat_test/smoke` for ultra-cheap liveness checks
    - `/home/auro/agents/agentchat_test` for deterministic read-only functional checks
    - `/home/auro/agents/agentchat_test/workspace` for edit, interruption, and resume checks
- Add integration coverage across `apps/server`, Convex ingress, and websocket runtime flow
- Keep generated Convex bindings in sync with the live deployment before manual confidence passes
- Run `bun run test:manual:live-runtime-smoke` against a real local `apps/server` instance to verify the full Codex plus Convex persistence path
- Use `bun run test:manual:live-runtime-repeat` when you need a small manually-invoked flake probe across repeated smoke turns
- Run `bun run test:manual:live-runtime-interrupt` to verify partial-output retention and interrupted run persistence
- Keep live runtime smoke assertions on terminal runtime bindings and persisted run-event timelines, not just final transcript rows
- Run `bun run test:manual:config-reload-smoke` to verify watched config changes disable or fallback safely without restarting the server
- Keep `bun run test:manual:runtime-confidence` as the single manual operator command for the local runtime stack
- Prefer Convex-issued backend session tokens for these live passes; allow the local signing fallback only while the deployment is still missing `BACKEND_TOKEN_SECRET`
- Add browser-level end-to-end coverage for agent selection, chat send, interruption, refresh, and recovery
- Keep explicit browser/runtime assertions that terminal runs restore the send button and clear any stale stop state
- Keep explicit reconnect assertions so recovery banners only appear after a known disconnect and reconnect
- Add long-stream rendering checks for assistant responses that naturally transition from progress narration into structured markdown
- Add local LAN browser checks for dev-origin, bootstrap, and websocket reachability
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
- Follow [Mobile Integration Testing](./mobile-integration-testing.md) for Linux-vs-macOS testing boundaries

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
