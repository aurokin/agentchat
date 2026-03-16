# Agentchat Convex Spec

This document describes the current Convex role in Agentchat.

Use it for the durable data model and the main client/backend function boundaries.
Use adjacent docs for detail:

- [Architecture](./architecture-v1.md) for the system overview
- [Runtime And Auth Plan](./runtime-and-auth-plan.md) for runtime and auth behavior
- [Backend API Spec](./backend-api-spec.md) for `apps/server` transport surfaces

## Convex Responsibilities

Convex is the durable source of truth for:

- authenticated users
- conversations
- messages
- runs
- run events
- runtime bindings
- lightweight cross-client preferences such as favorite models

It is also the authority for:

- access identity resolution
- user-scoped authorization
- backend token issuance for `apps/server`

## Design Rules

- public functions derive the acting user from auth context
- public functions do not trust caller-supplied `userId` for authorization
- runtime writes from `apps/server` enter through trusted ingress and dispatch to internal mutations/actions
- transient live-runtime process state does not belong in Convex

## Main Tables

### `users`

Current user record responsibilities:

- auth-backed user identity
- local-auth metadata such as `username`, `authProvider`, and `localAuthEnabled`
- lightweight preferences such as `favoriteModelIds`
- workspace usage counters

Important constraint:

- Agentchat does not persist per-user default provider, model, or variant state in Convex

### `chats`

Purpose:

- user-owned conversations bound to one agent

Current durable fields include:

- `userId`
- `localId`
- `agentId`
- `title`
- `modelId`
- `variantId`
- `settingsLockedAt`
- `lastViewedAt`
- `createdAt`
- `updatedAt`

Key behavior:

- conversations are user-scoped
- conversations store the chosen model and variant for that conversation
- those settings lock after the first message

### `messages`

Purpose:

- durable user and assistant transcript rows

Current message data includes:

- `role`
- `kind`
- `content`
- `contextContent`
- `status`
- `runId`
- `runMessageIndex`
- `modelId`
- `variantId`
- `reasoningEffort`
- timestamps

Important behavior:

- assistant messages may start as drafts or streaming rows
- partial assistant output remains visible
- provider-native `assistant_status` rows are distinct from final `assistant_message` rows

### `runs`

Purpose:

- one execution record per assistant attempt

Current run data includes:

- `externalId`
- `provider`
- `status`
- `triggerMessageId`
- `outputMessageId`
- `providerThreadId`
- `providerTurnId`
- `startedAt`
- `completedAt`
- `errorMessage`

### `run_events`

Purpose:

- append-only normalized runtime event history

Current persisted kinds include:

- `run_started`
- `message_started`
- `message_delta`
- `message_completed`
- `run_completed`
- `run_interrupted`
- `run_failed`
- `approval_requested`
- `approval_resolved`
- `user_input_requested`
- `user_input_resolved`
- `provider_status`

### `runtime_bindings`

Purpose:

- recoverable provider-runtime metadata for one conversation

Current binding data includes:

- `chatId`
- `userId`
- `provider`
- `status`
- `providerThreadId`
- `providerResumeToken`
- `activeRunId`
- `lastError`
- `lastEventAt`
- `expiresAt`
- `updatedAt`

Important constraint:

- only recoverable runtime state belongs here
- live provider handles and live socket state stay in `apps/server`

## Main Client-Facing Surfaces

Current client-facing Convex surfaces include:

- user queries and mutations in `users.ts` for:
    - current user resolution
    - favorite model preferences
    - workspace reset and usage helpers
- chat queries and mutations in `chats.ts`
- message queries and mutations in `messages.ts`
- run queries in `runs.ts`
- runtime activity queries in `runtimeBindings.ts`
- backend token issuance in `backendTokens.ts`

## Backend Ingress Boundary

`apps/server` persists runtime state through trusted ingress into Convex, then internal runtime mutations update:

- runs
- messages
- run events
- runtime bindings

That keeps provider-runtime persistence server-owned while keeping Convex as the durable source of truth.
