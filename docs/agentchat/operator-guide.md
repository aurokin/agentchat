# Agentchat Operator Guide

This guide is the shortest path from a local Agentchat checkout to a usable self-hosted instance with Codex-backed agents.

## Scope

Use this document when you need to:

- configure `apps/server/agentchat.config.json`
- expose one or more local workspaces as agents
- validate your Codex runtime wiring before opening the UI
- run the deliberate Codex confidence pass

This guide assumes:

- you are using the current Codex-first architecture
- Convex is configured for auth and conversation persistence
- `apps/server` runs locally on the same machine that has access to the agent workspaces

Required shared secrets:

- `BACKEND_TOKEN_SECRET`
    - must exist in both Convex and `apps/server`
    - used to mint and verify short-lived backend websocket session tokens
- `RUNTIME_INGRESS_SECRET`
    - must exist in both Convex and `apps/server`
    - used by `apps/server` to persist runs and runtime bindings through Convex HTTP ingress

If `BACKEND_TOKEN_SECRET` is still missing from the Convex deployment, the manual live smoke script can fall back to a locally signed token when `apps/server` has the secret. That is useful for development, but it should be treated as a temporary setup gap rather than the desired end state.

## 1. Pick Your Agent Workspaces

An Agentchat agent is an operator-approved workspace on disk.

For each agent, decide:

- display name
- absolute `rootPath`
- default provider
- default model
- default variant

Keep these workspaces stable. If you move a workspace, update `agentchat.config.json` and re-run the doctor command before using the app again.

## 2. Create Or Update `agentchat.config.json`

Start from:

- `apps/server/agentchat.config.example.json`

If you want the built-in low-token fixtures, generate a ready-made local config:

```bash
bun run setup:test-agent-config
```

That writes a gitignored:

- `apps/server/agentchat.config.json`

pointing at:

- `/home/auro/agents/agentchat_test/smoke`
- `/home/auro/agents/agentchat_test`
- `/home/auro/agents/agentchat_test/workspace`

If you already have a local config and want to replace it:

```bash
bun run setup:test-agent-config -- --force
```

For custom agents, edit the generated file or create your own from the example template.

## 3. Validate Convex And Generated Types

Before any real manual pass, make sure the local repo matches the active Convex deployment:

```bash
bun run --cwd packages/convex codegen
```

If this fails, do not trust the local type surface yet.

## 4. Validate Server And Codex Reachability

Run:

```bash
bun run doctor:server
```

This checks:

- configured provider and agent readiness
- missing directories
- disabled default fallback situations
- live Codex model access for each enabled provider

If this command fails, fix server config or Codex runtime access before opening the web or mobile app.

## 5. Start The Local Stack

Web + server + Convex:

```bash
bun run dev:web
```

Mobile + Convex:

```bash
bun run dev:mobile
```

If you need the full local stack:

```bash
bun run dev:all
```

## 6. Run The Deliberate Confidence Pass

Use:

```bash
bun run test:manual:codex-confidence
```

This manually invoked command currently runs:

- env/docs validation
- live Convex codegen
- `doctor:server`
- targeted server confidence tests
- targeted web confidence tests
- targeted mobile confidence tests

Then use:

- [manual-qa-checklist.md](./manual-qa-checklist.md)

for the real interactive smoke, functional, interruption, reconnect, and restart checks.

For direct local runtime verification with a running `apps/server`, also use:

```bash
bun run test:manual:live-runtime-smoke
bun run test:manual:live-runtime-interrupt
```

## 7. Common Failure Modes

If bootstrap fails in the web app:

- verify `NEXT_PUBLIC_AGENTCHAT_SERVER_URL`
- verify `apps/server` is running
- verify `agentchat.config.json` is valid

If `doctor:server` reports live Codex access failure:

- verify the `codex` command is available in the server environment
- verify provider `cwd` and agent `rootPath` exist
- verify the Codex app-server command can start in that environment

If the UI shows no agents:

- verify the agent is enabled
- verify the agent references at least one enabled provider
- verify the allowlisted Google account is the one you signed in with

## 8. Current Rule

For this phase of Agentchat:

- optimize for Codex confidence first
- do not broaden implementation work toward other providers yet
- keep tests manually invoked, not automatic on push
