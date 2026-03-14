# Agentchat Manual QA Checklist

Use this checklist for deliberate Codex confidence passes. These checks are manual on purpose and should not run automatically on push.

Before the interactive checklist, run:

```bash
bun run setup:test-agent-config
bun run test:manual:codex-confidence
```

For live runtime persistence validation with a running local server, also run:

```bash
bun run test:manual:live-runtime-smoke
bun run test:manual:live-runtime-interrupt
bun run test:manual:stale-runtime-resume
bun run test:manual:config-reload-smoke
bun run test:manual:operator-failure-smoke
bun run test:manual:doctor-env-smoke
```

Or use the bundled command:

```bash
bun run test:manual:runtime-confidence
```

For the current disabled-auth browser confidence path, also run:

```bash
bun run test:manual:web-browser-confidence
bun run test:manual:web-operator-smoke
```

Run those browser commands sequentially. The operator smoke command intentionally edits `apps/server/agentchat.config.json` to verify hot reload behavior.

## Fixtures

- smoke: `/home/auro/agents/agentchat_test/smoke`
- primary: `/home/auro/agents/agentchat_test`
- workspace: `/home/auro/agents/agentchat_test/workspace`

## Preconditions

- Convex is configured and reachable
- `bun run --cwd packages/convex codegen` succeeds against the selected deployment
- `apps/server` is running
- the web app is running
- if auth mode is `google`, the selected Google account is allowlisted
- if auth mode is `disabled`, the default workspace user can be initialized successfully
- `bun run doctor:server` reports the configured Codex provider and target agents as ready, and shows live Codex model access for each enabled provider

For the fullest backend-auth coverage:

- `BACKEND_TOKEN_SECRET` is configured in the Convex deployment
- the same `BACKEND_TOKEN_SECRET` is configured for `apps/server`

If the Convex deployment is still missing `BACKEND_TOKEN_SECRET`, the live runtime smoke command can fall back to a locally signed token. That still validates websocket runtime behavior and Convex persistence, but it does not validate the Convex-issued backend token path.

## 1. Smoke

Use `/home/auro/agents/agentchat_test/smoke`.

- Run `bun run doctor:server`
- Sign in if auth mode is `google`
- Select the smoke agent
- Start a new conversation
- Send a greeting
- Confirm a fast, concise response arrives

## 2. Deterministic Read-Only Flow

Use `/home/auro/agents/agentchat_test`.

- Ask: `What is this agent?`
- Ask: `Summarize README.md in one sentence.`
- Ask: `Which file explains the current test status?`
- Ask: `What does add(2, 3) return?`
- Confirm responses are short and grounded in local files

## 3. Agent Scoping

- Create or open conversations under one agent
- Switch to a different agent
- Confirm the visible conversation list changes with the selected agent
- Switch back and confirm the earlier conversations are still present

## 4. Interruption

Use `/home/auro/agents/agentchat_test/workspace`.

- Ask for one small edit in `notes.md`
- Interrupt the run before completion
- Confirm the run is marked interrupted
- Confirm partial assistant output remains visible

## 5. Refresh And Reconnect

Use the primary or workspace fixture.

- Start a response
- Refresh the page mid-run
- Confirm the conversation reloads cleanly
- Confirm the active run state is restored or explained correctly

## 6. Server Restart Recovery

Use `/home/auro/agents/agentchat_test/workspace`.

- Send one successful message
- Restart `apps/server`
- Send a follow-up message in the same conversation
- Confirm the thread resumes rather than behaving like a fresh chat

## 7. Config Change Handling

- Disable an agent or provider in `agentchat.config.json`
- Refresh `/api/diagnostics` or rerun `bun run doctor:server`
- Confirm the UI adapts safely
- Confirm broken or removed resources do not produce silent failures
- `bun run test:manual:config-reload-smoke` covers the hot-reload path automatically against the local server
- `bun run test:manual:web-operator-smoke` covers the browser-visible hot-reload path against the local web app
- `bun run test:manual:operator-failure-smoke` covers invalid config reloads and missing path diagnostics
- `bun run test:manual:doctor-env-smoke` covers missing runtime env diagnostics

## 8. Stale Runtime Binding Recovery

Use the primary fixture.

- Run `bun run test:manual:stale-runtime-resume`
- Confirm a deliberately stale persisted runtime binding falls back to a fresh Codex thread
- Confirm the runtime binding is replaced rather than left stale

## 9. Mobile Parity Pass

Run the same smoke and deterministic checks on mobile.

- sign in if auth mode is `google`
- select the same fixture agent
- send and interrupt
- reconnect if possible
- confirm behavior broadly matches web
