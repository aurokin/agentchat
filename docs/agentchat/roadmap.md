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
- Manual local-auth separation checks for `smoke_1` and `smoke_2`
- Manual browser confidence coverage for the local-auth web flow
- Manual operator browser smoke for config hot-reload and disabled agent/provider handling
- Manual operator failure smoke for invalid config reloads, missing paths, and env diagnostics
- Manual stale-runtime-resume smoke for recoverable runtime-binding fallback
- Server coverage for websocket command routing, persistence client endpoints, start-failure persistence, mid-stream runtime crash handling, and live terminal binding and run-event persistence checks
- Removal of billing, analytics, attachments, browser-local product modes, and hosted deployment assumptions

## Active Work

- Tighten end-to-end reliability across web, server, Convex, and Codex
- Close the remaining mobile parity gaps
- Keep Codex-backed model and variant discovery well-tested and operator-friendly
- Keep local multi-user auth and backend-issued runtime identity hardened across web, mobile, server, and Convex
    - local auth is now a real Convex-backed provider path rather than a shared default-user mode
    - web and mobile both expose local username/password login when the active auth provider kind is `local`
    - backend session tokens resolve to a concrete Convex user and stay user-scoped through websocket runtime commands
    - local seeded users such as `smoke_1` and `smoke_2` are the standard local multi-user runtime fixtures
- Keep the backend-owned runtime model honest under reconnect, zero-client, and multi-observer scenarios
    - users can switch conversations or agents during submission
    - users can have active runs in multiple conversations and agents at the same time
    - runs continue with zero active clients and recover cleanly later
    - multiple clients can observe the same run concurrently without duplicating execution
    - clients keep background subscriptions to all active conversations instead of only the visible thread
    - web and mobile both surface per-thread runtime activity (`Working`, `New reply`, `Needs attention`) from backend-owned runtime state
    - workspace-level per-agent activity counts are derived in Convex instead of per-client tallying
    - multiple users can use the same instance at the same time without crossing runtime state
- Investigate Codex model and variant mapping in the live product path
- Verify whether Codex Spark is functioning correctly in the current integration
- Expand provider-native runtime item mapping so multi-message output follows real Codex events instead of transcript inference
    - emit first-class progress/status items when the provider gives us typed runtime events
    - keep transcript formatting cleanup separate from transcript structure
- Validate provider-native `assistant_status` items with real Codex turns and keep them covered by manual smoke commands
- Improve operator-facing diagnostics and health reporting
- Expand the practical testing stack around the dedicated local fixtures in `~/agents/agentchat_test`
- Keep the active roadmap narrowly focused on Codex confidence rather than adding more providers
- Use the live Convex deployment for real codegen, runtime persistence validation, and end-to-end confidence passes
- Use local seeded users like `smoke_1` and `smoke_2` as the default local integration and browser-confidence path
- Use [Runtime And Auth Plan](./runtime-and-auth-plan.md) as the detailed source doc for the remaining backend-owned runtime and provider-oriented auth work
- Keep targeted regression coverage for browser-visible runtime state so manual catches like stale stop buttons and false reconnect banners stay scriptable checks
- Add regression fixtures for long streamed assistant prose formatting and LAN browser access during local development
- Keep mobile integration testing explicitly gated by host-platform support instead of implying universal simulator/device coverage

## Next Milestones

### 1. Testing And Validation

- Standardize on the dedicated local test fixtures in `~/agents/agentchat_test`
    - `~/agents/agentchat_test/smoke` for ultra-cheap liveness checks
    - `~/agents/agentchat_test` for deterministic read-only functional checks
    - `~/agents/agentchat_test/workspace` for edit, interruption, and resume checks
- Add integration coverage across `apps/server`, Convex ingress, and websocket runtime flow
- Keep generated Convex bindings in sync with the live deployment before manual confidence passes
- Run `bun run test:manual:live-runtime-smoke` against a real local `apps/server` instance to verify the full Codex plus Convex persistence path
- Run `bun run test:manual:live-runtime-zero-client` to verify a run continues with zero active clients and later reconnects without stale active-run replay
- Run `bun run test:manual:live-runtime-zero-client-recover` to verify a client can reconnect after a real zero-client gap and resume the active run before completion
- Run `bun run test:manual:live-runtime-multi-client` to verify one same-user run stays live across two clients and survives an initiating-client disconnect after `run.started`
- Run `bun run test:manual:live-runtime-multi-conversation` to verify one user can run two conversations concurrently without runtime-state crossover
- Run `bun run test:manual:live-runtime-multi-agent` to verify one user can run two different agents concurrently without runtime-state crossover
- Run `bun run test:manual:live-runtime-multi-user` to verify two authenticated users can run concurrently without runtime-state crossover
- Run `bun run test:manual:local-auth-separation` after `bun run setup:local-auth-smoke` to verify `smoke_1` and `smoke_2` stay isolated
- Run `bun run test:manual:live-runtime-status` to verify a real Codex turn persists both `assistant_status` and `assistant_message` transcript items
- Use `bun run test:manual:live-runtime-repeat` when you need a small manually-invoked flake probe across repeated smoke turns
- Run `bun run test:manual:live-runtime-interrupt` to verify partial-output retention and interrupted run persistence
- Keep live runtime smoke assertions on terminal runtime bindings and persisted run-event timelines, not just final transcript rows
- Keep per-thread `Working`, `New reply`, and `Needs attention` state derived from Convex so web and mobile stay in sync instead of recomputing unread/runtime activity separately on each client
- Keep workspace-level per-agent active counts derived from Convex as well, so chat lists and agent switchers are reading the same backend-owned activity summary
- Run `bun run test:manual:config-reload-smoke` to verify watched config changes disable or fallback safely without restarting the server
- Keep `bun run test:manual:runtime-confidence` as the single manual operator command for the local runtime stack
- Prefer Convex-issued backend session tokens for these live passes; allow the local signing fallback only while the deployment is still missing `BACKEND_TOKEN_SECRET`
- Add browser-level end-to-end coverage for agent selection, chat send, interruption, refresh, and recovery
- Keep explicit browser/runtime assertions that terminal runs restore the send button and clear any stale stop state
- Keep explicit reconnect assertions so recovery banners only appear after a known disconnect and reconnect
- Keep long-stream rendering checks for assistant responses that naturally transition from progress narration into structured markdown
- Add local LAN browser checks for dev-origin, bootstrap, and websocket reachability
- Keep the local-auth browser path as the primary local web confidence path
- Run `bun run test:manual:web-browser-confidence` for the real web smoke, cancel, refresh, and long-stream markdown flow
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
