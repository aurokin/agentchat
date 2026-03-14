# Agentchat Server Config Spec

## Purpose

This spec defines the operator-managed configuration file loaded by `apps/server`.

The file is intended to be edited by humans. It configures:

- global auth behavior
- globally configured providers
- globally visible agents

In v1, all agent visibility is global to all allowed users.

## File Format

V1 uses a single top-level JSON file:

- filename: `agentchat.config.json`
- encoding: UTF-8
- location: alongside the deployed server app or provided by a `--config` flag

Future support for YAML or TOML is allowed, but JSON is the only format specified for v1.

## Top-Level Shape

```json
{
  "version": 1,
  "auth": {},
  "providers": [],
  "agents": []
}
```

## Validation Rules

- The file must validate fully before it is used.
- If a reload fails validation, the server keeps using the last known good config.
- Provider ids must be unique.
- Agent ids must be unique.
- Agents may only reference provider ids that exist.
- Paths must be absolute after resolution.
- Disabled providers or agents remain in config state but are not offered to users.

## Reload Behavior

- The server loads config at startup.
- The server watches the file for changes.
- On change, the server revalidates and swaps to the new config atomically.
- Existing conversations always adopt the latest valid config for their agent.

## `auth`

Purpose:

- define who can access the instance

Preferred auth shape:

```json
{
  "defaultProviderId": "local-main",
  "providers": [
    {
      "id": "local-main",
      "kind": "local",
      "enabled": true,
      "allowSignup": false
    }
  ]
}
```

Google provider shape:

```json
{
  "defaultProviderId": "google-main",
  "providers": [
    {
      "id": "google-main",
      "kind": "google",
      "enabled": true,
      "allowlistMode": "email",
      "allowedEmails": ["user@example.com"],
      "allowedDomains": [],
      "googleHostedDomain": null
    }
  ]
}
```

Fields:

- `defaultProviderId`
  - required
  - must reference an enabled auth provider
- `providers`
  - required
  - array of auth providers
- `providers[].id`
  - stable auth provider id
- `providers[].kind`
  - current values: `"google"` or `"local"`
- `providers[].enabled`
  - boolean
- `providers[].allowSignup`
  - required only for local providers
  - boolean
  - first slice should normally keep this `false` and rely on operator-seeded users
- `providers[].allowlistMode`
  - required only for Google providers
  - current allowed value: `"email"`
- `providers[].allowedEmails`
  - required only for Google providers
  - array of exact email strings
- `providers[].allowedDomains`
  - reserved for later
- `providers[].googleHostedDomain`
  - optional string or `null`

V1 decision:

- in Google mode, instance access is granted only if the signed-in email is present in `allowedEmails`
- in local mode, Convex Auth owns password verification and every successful login maps to one concrete `users` row

Legacy note:

- `auth.mode: "google"` legacy configs are still accepted and normalized internally
- new configs should use `auth.defaultProviderId` plus `auth.providers[]`

## `providers`

Purpose:

- define the globally available runtime providers

Example:

```json
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
```

Required fields:

- `id`
  - stable provider id
- `kind`
  - v1 allowed value: `"codex"`
- `label`
  - operator-facing display name
- `enabled`
  - boolean
- `idleTtlSeconds`
  - how long an idle conversation runtime may stay warm
- `modelCacheTtlSeconds`
  - TTL for cached model and variant metadata

Provider-specific fields for Codex:

- `codex.command`
  - binary name or absolute path
- `codex.args`
  - optional extra CLI args
- `codex.baseEnv`
  - optional environment overrides
- `codex.cwd`
  - optional default working directory for provider startup

Notes:

- Secrets should not be embedded in the config file if they can live in environment variables instead.
- Providers are defined once globally and referenced by agents.

## `agents`

Purpose:

- expose operator-defined workspaces to end users

Example:

```json
{
  "id": "marketing-site",
  "name": "Marketing Site",
  "description": "Public website repository",
  "avatar": "/avatars/marketing-site.png",
  "enabled": true,
  "rootPath": "/srv/repos/marketing-site",
  "providerIds": ["codex-main"],
  "defaultProviderId": "codex-main",
  "defaultModel": "gpt-5.3-codex",
  "defaultVariant": "balanced",
  "modelAllowlist": [],
  "variantAllowlist": [],
  "tags": ["web", "nextjs"],
  "sortOrder": 10
}
```

Required fields:

- `id`
  - stable agent id
- `name`
  - user-facing name
- `enabled`
  - boolean
- `rootPath`
  - absolute path to the workspace the provider should operate against
- `providerIds`
  - ordered list of allowed provider ids
- `defaultProviderId`
  - must exist inside `providerIds`

Optional fields:

- `description`
- `avatar`
  - URL or absolute file path
- `defaultModel`
- `defaultVariant`
- `modelAllowlist`
  - empty means provider default availability
- `variantAllowlist`
  - empty means provider default availability
- `tags`
- `sortOrder`

V1 behavior:

- all enabled agents are visible to all allowed users
- conversations store only `agentId`
- agent config is resolved live from the current server config

## Derived Availability Rules

When the backend exposes options to a client:

1. Start with the provider's live model catalog.
2. Apply agent-level provider filtering.
3. Apply `modelAllowlist` if present.
4. Apply `variantAllowlist` if present.
5. Return normalized provider, model, and variant options to the client.

## Config Change Rules

- If an agent changes its default provider, model, or variant, new draft conversations should see the new defaults.
- Existing conversations must continue to use their stored provider, model, and variant if already chosen.
- Existing conversations still resolve the latest agent config for things like enabled state and root path.
- If a provider or agent is disabled, the backend should reject new runs and expose a normalized unavailable error.

## Non-Goals For V1

- per-agent user visibility
- provider secrets inside the config file
- UI-based config editing
- remote config management
