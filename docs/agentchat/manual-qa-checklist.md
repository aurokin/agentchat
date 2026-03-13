# Agentchat Manual QA Checklist

Use this checklist for deliberate Codex confidence passes. These checks are manual on purpose and should not run automatically on push.

Before the interactive checklist, run:

```bash
bun run test:manual:codex-confidence
```

## Fixtures

- smoke: `/home/auro/agents/agentchat_test/smoke`
- primary: `/home/auro/agents/agentchat_test`
- workspace: `/home/auro/agents/agentchat_test/workspace`

## Preconditions

- Convex is configured and reachable
- `apps/server` is running
- the web app is running
- the selected Google account is allowlisted
- `bun run doctor:server` reports the configured Codex provider and target agents as ready, and shows live Codex model access for each enabled provider

## 1. Smoke

Use `/home/auro/agents/agentchat_test/smoke`.

- Run `bun run doctor:server`
- Sign in
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

## 8. Mobile Parity Pass

Run the same smoke and deterministic checks on mobile.

- sign in
- select the same fixture agent
- send and interrupt
- reconnect if possible
- confirm behavior broadly matches web
