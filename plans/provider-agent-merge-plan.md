# Provider-Agent Merge Plan

## Motivation

The current architecture separates providers and agents into distinct config-level concepts. Agents reference providers via `providerIds[]` and `defaultProviderId`, and providers are defined in a top-level `providers[]` array.

This separation assumed providers would be shared resources that multiple agents tap into. In practice, every runtime we plan to support (Codex, Pi, OpenCode, Claude Code) owns its own LLM connection internally. The provider is not a shared resource. It is an implementation detail of how each agent runtime talks to models.

Collapsing provider into agent:

- removes a concept from the UX that operators and users do not need
- matches the actual architecture of every runtime we are integrating
- simplifies the config file
- eliminates indirection in the server's resolution path
- makes multi-runtime support cleaner because each agent carries its own runtime config

Model and variant selection remain user-facing. Users still choose from the models available through the agent's runtime. The difference is that models come from the agent, not from a separately configured provider.

## Config Schema Changes

### Before (v1)

```json
{
  "version": 1,
  "auth": {},
  "providers": [
    {
      "id": "codex-main",
      "kind": "codex",
      "label": "Codex Main",
      "enabled": true,
      "idleTtlSeconds": 900,
      "modelCacheTtlSeconds": 300,
      "codex": {
        "command": "codex",
        "args": ["app-server"],
        "baseEnv": {},
        "cwd": "/srv/agentchat"
      }
    }
  ],
  "agents": [
    {
      "id": "marketing-site",
      "name": "Marketing Site",
      "enabled": true,
      "rootPath": "/srv/repos/marketing-site",
      "providerIds": ["codex-main"],
      "defaultProviderId": "codex-main",
      "defaultModel": "gpt-5.4",
      "defaultVariant": "medium"
    }
  ]
}
```

### After (v2)

```json
{
  "version": 2,
  "auth": {},
  "agents": [
    {
      "id": "marketing-site",
      "name": "Marketing Site",
      "enabled": true,
      "rootPath": "/srv/repos/marketing-site",
      "runtime": {
        "kind": "codex",
        "idleTtlSeconds": 900,
        "modelCacheTtlSeconds": 300,
        "codex": {
          "command": "codex",
          "args": ["app-server"],
          "baseEnv": {}
        }
      },
      "defaultModel": "gpt-5.4",
      "defaultVariant": "medium",
      "modelAllowlist": [],
      "variantAllowlist": [],
      "tags": ["web", "nextjs"],
      "sortOrder": 10
    }
  ]
}
```

### Key Differences

- The top-level `providers[]` array is removed.
- Each agent has an inline `runtime` block with a `kind` discriminator.
- `providerIds` and `defaultProviderId` are removed from agent config.
- Runtime-specific config lives under `runtime.<kind>` (e.g., `runtime.codex`).
- `idleTtlSeconds` and `modelCacheTtlSeconds` move into `runtime`.
- `rootPath` stays on the agent because it is workspace-scoped, not runtime-scoped.
- `defaultModel`, `defaultVariant`, `modelAllowlist`, `variantAllowlist` stay on the agent.
- Config version bumps to `2`.

### Runtime Kind Blocks

Each kind carries only what that runtime needs:

```json
"runtime": {
  "kind": "codex",
  "idleTtlSeconds": 900,
  "modelCacheTtlSeconds": 300,
  "codex": {
    "command": "codex",
    "args": ["app-server"],
    "baseEnv": {}
  }
}
```

```json
"runtime": {
  "kind": "pi",
  "idleTtlSeconds": 900,
  "modelCacheTtlSeconds": 300,
  "pi": {
    "command": "pi",
    "args": ["--mode", "rpc"],
    "baseEnv": {}
  }
}
```

```json
"runtime": {
  "kind": "opencode",
  "idleTtlSeconds": 900,
  "modelCacheTtlSeconds": 300,
  "opencode": {
    "command": "opencode",
    "args": ["serve"],
    "baseEnv": {},
    "port": 0
  }
}
```

```json
"runtime": {
  "kind": "claude-code",
  "modelCacheTtlSeconds": 300,
  "claudeCode": {
    "command": "claude",
    "args": [],
    "baseEnv": {},
    "permissionMode": "auto"
  }
}
```

## Server Changes

### Config Validation

- New Zod schema: `RuntimeSchema` as a discriminated union on `kind`.
- `AgentSchema` replaces `providerIds` and `defaultProviderId` with `runtime: RuntimeSchema`.
- Config version validated as `2`.
- Validation rejects agents with unknown runtime kinds.

### Runtime Manager

Current state: `CodexRuntimeManager` handles all runtime lifecycle.

Target state: A `RuntimeManager` that dispatches to kind-specific implementations.

```
RuntimeManager (dispatcher)
  resolveRuntime(agent) -> KindRuntime

KindRuntime (interface)
  startTurn(params) -> event stream
  interruptTurn(turnId)
  listModels() -> model catalog
  dispose()

CodexRuntime implements KindRuntime
PiRuntime implements KindRuntime
OpenCodeRuntime implements KindRuntime
ClaudeCodeRuntime implements KindRuntime
```

The dispatcher creates or reuses a `KindRuntime` based on the agent's `runtime.kind`. Conversation lifecycle, event normalization, WebSocket fanout, and Convex persistence remain shared.

### Provider Resolution Removal

Current flow:
1. Resolve agent config.
2. Look up `defaultProviderId` in `providers[]`.
3. Use provider config for runtime creation.

New flow:
1. Resolve agent config.
2. Use `agent.runtime` directly.

The indirection through `providers[]` is eliminated.

### Model Catalog

Current: `CodexModelCatalog` fetches models from Codex and caches per provider id.

New: Model catalog becomes per-agent, scoped by `agentId`. Each runtime kind implements its own model fetching:

- Codex: `model/list` RPC (unchanged).
- Pi: `get_state` RPC or embed `ModelRegistry` in-process.
- OpenCode: `GET /provider/models` REST endpoint.
- Claude Code: static model list (Opus, Sonnet, Haiku families).

Cache key changes from `providerId` to `agentId`.

### HTTP Endpoints

| Before | After | Notes |
|--------|-------|-------|
| `GET /api/bootstrap` | `GET /api/bootstrap` | Remove provider summaries, agents carry runtime kind |
| `GET /api/providers/:providerId/models` | `GET /api/agents/:agentId/models` | Models scoped to agent |
| `GET /api/agents/:agentId/options` | `GET /api/agents/:agentId/options` | Remove provider list, keep model and variant options |

### WebSocket Commands

| Before | After | Notes |
|--------|-------|-------|
| `conversation.send` | `conversation.send` | Remove provider context from payload |
| `provider.models.refresh` | `agent.models.refresh` | Scoped to agent |

WebSocket events remain unchanged. They are already provider-agnostic.

## Convex Changes

### `chats` Table

Current fields include `modelId` and `variantId`. These remain. There is no `providerId` field to remove.

Add `runtimeKind` to persisted chat metadata so the UI can display which runtime a conversation used.

### `runtime_bindings` Table

Current `provider` field stores the provider id string.

Change to `runtimeKind` storing the kind string (e.g., `"codex"`, `"pi"`). The binding still stores `providerThreadId` and `providerResumeToken` as opaque runtime-owned state.

### `runs` Table

Current `provider` field stores the provider id string.

Change to `runtimeKind` storing the kind string.

## Client Changes

### Bootstrap

Current: Bootstrap returns `providers[]` and `agents[]` separately. Clients use provider summaries for model fetching.

New: Bootstrap returns `agents[]` with `runtimeKind` metadata. No separate provider list.

### Model Selection

Current: Client fetches models from `/api/providers/:providerId/models`, then filters by agent options.

New: Client fetches models from `/api/agents/:agentId/models`. Filtering is already applied server-side.

### UI

- Remove provider selector from the conversation draft header.
- Keep model and variant selectors.
- Each agent still shows its available models and variants, but sourced from the agent's runtime rather than a separate provider.
- The agent card or header may show the runtime kind as informational context (e.g., a small icon or label).

### Conversation Lock

Current: Provider, model, and variant lock after first message.

New: Model and variant lock after first message. The runtime kind is fixed by the agent and never changes.

## Migration Path

### Phase 1: Config Schema Migration

1. Update config Zod schemas to support version `2` format.
2. Write a config normalizer that accepts both v1 and v2:
   - v1: resolve `providers[]` + `providerIds` into inline `runtime` blocks on each agent.
   - v2: use directly.
3. Update `doctor:server` to validate the new schema.
4. Update `agentchat.config.example.json` to v2 format.
5. Update `setup:test-agent-config` to generate v2 format.

### Phase 2: Server Internals

1. Extract `KindRuntime` interface from `CodexRuntimeManager`.
2. Implement `CodexRuntime` as the first `KindRuntime` implementation.
3. Build `RuntimeManager` dispatcher that resolves agent config to the correct `KindRuntime`.
4. Refactor model catalog to be agent-scoped.
5. Update HTTP endpoints.
6. Update WebSocket command handlers.

### Phase 3: Convex Migration

1. Update `runtime_bindings` to use `runtimeKind`.
2. Update `runs` to use `runtimeKind`.
3. Add `runtimeKind` to `chats` metadata.
4. Write a Convex migration for existing data (map old provider id strings to `"codex"`).

### Phase 4: Client Updates

1. Update bootstrap response handling.
2. Update model fetching to use agent-scoped endpoint.
3. Remove provider selector UI.
4. Update conversation draft state management.

### Phase 5: Cleanup

1. Remove v1 config support after confirming all deployments have migrated.
2. Remove `providers[]` schema code.
3. Remove provider resolution indirection.
4. Update all docs to reflect the merged model.

## Validation Strategy

- Existing Codex confidence tests must pass unchanged after the refactor.
- `doctor:server` must validate v2 config correctly.
- Bootstrap response shape change requires web and mobile client updates in the same pass.
- Config reload behavior must work with v2 configs.
- Existing conversations with v1 runtime bindings must recover correctly after the migration.

## Constraints

- This merge happens before any new runtime is added.
- The v1-to-v2 normalizer ensures existing operator configs continue working during the transition.
- No runtime behavior changes. This is a config and resolution refactor only.
- The `KindRuntime` interface is designed but only `CodexRuntime` is implemented in this phase.
