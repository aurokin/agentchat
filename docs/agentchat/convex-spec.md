# Agentchat Convex Spec

## Purpose

This spec defines the v1 Convex data model and function boundaries for Agentchat.

Convex is the source of truth for:

- authenticated users
- conversations
- messages
- runs
- run events
- runtime bindings
- user defaults

## Convex Design Rules

- All public functions must derive the acting user from `ctx.auth.getUserIdentity()`.
- No function may accept `userId` as an authorization argument.
- All functions must define argument validators.
- Node-only work must not live in query or mutation files.
- Runtime writes from `apps/server` should enter Convex through backend-authenticated ingress, then dispatch to internal mutations and actions.

## Tables

### `users`

Use the existing Convex auth-backed user record and extend it as needed.

Recommended fields:

- `name`
- `image`
- `email`
- `createdAt`
- `updatedAt`
- `lastSeenAt`
- `accessRevokedAt`

Indexes:

- `by_email`

Notes:

- access remains controlled by auth plus allowlist, not by a client-supplied user id

### `user_global_defaults`

Purpose:

- store default provider, model, and variant for a user when no agent-specific override exists

Fields:

- `userId`
- `provider`
- `model`
- `variant`
- `updatedAt`

Indexes:

- `by_userId`

### `user_agent_defaults`

Purpose:

- store per-agent overrides on top of global defaults

Fields:

- `userId`
- `agentId`
- `provider`
- `model`
- `variant`
- `updatedAt`

Indexes:

- `by_userId_and_agentId`

### `conversations`

Purpose:

- user-owned threads bound to exactly one agent

Fields:

- `userId`
- `agentId`
- `title`
- `titleSource`
  - `"auto"` or `"manual"`
- `provider`
- `model`
- `variant`
- `settingsLockedAt`
  - `null` until first message locks the settings
- `lastMessageAt`
  - `null` for empty conversations
- `createdAt`
- `updatedAt`

Indexes:

- `by_userId_and_agentId_and_updatedAt`
- `by_userId_and_updatedAt`

Notes:

- conversations are hard-deleted
- conversations store only `agentId`, not agent config snapshots
- empty conversations are valid

### `messages`

Purpose:

- durable transcript rendered to users

Fields:

- `conversationId`
- `userId`
- `role`
  - `"user" | "assistant" | "system"`
- `content`
- `status`
  - `"draft" | "streaming" | "completed" | "interrupted" | "errored"`
- `runId`
  - optional, typically set for assistant messages
- `createdAt`
- `updatedAt`
- `completedAt`
  - optional

Indexes:

- `by_conversationId_and_createdAt`
- `by_userId_and_createdAt`
- `by_runId`

Notes:

- partial assistant messages remain visible
- assistant messages may be patched during streaming

### `runs`

Purpose:

- execution record for one assistant attempt triggered by a user message

Fields:

- `conversationId`
- `userId`
- `provider`
- `status`
  - `"queued" | "starting" | "running" | "completed" | "interrupted" | "errored"`
- `triggerMessageId`
  - user message that initiated the run
- `outputMessageId`
  - optional assistant message record
- `providerThreadId`
  - optional provider thread/session id snapshot for debugging
- `providerTurnId`
  - optional provider turn/run id
- `startedAt`
- `completedAt`
  - optional
- `errorMessage`
  - optional

Indexes:

- `by_conversationId_and_startedAt`
- `by_userId_and_startedAt`
- `by_status_and_startedAt`

### `run_events`

Purpose:

- append-only normalized event history for a run

Fields:

- `runId`
- `conversationId`
- `userId`
- `sequence`
- `kind`
  - `"run_started"`
  - `"message_delta"`
  - `"message_completed"`
  - `"run_completed"`
  - `"run_interrupted"`
  - `"run_failed"`
  - `"approval_requested"`
  - `"approval_resolved"`
  - `"user_input_requested"`
  - `"user_input_resolved"`
  - `"provider_status"`
- `messageId`
  - optional
- `textDelta`
  - optional
- `errorMessage`
  - optional
- `data`
  - optional JSON string for structured payloads that do not deserve top-level fields
- `createdAt`

Indexes:

- `by_runId_and_sequence`
- `by_conversationId_and_createdAt`
- `by_userId_and_createdAt`

Notes:

- do not persist raw provider noise blindly
- coalesce text deltas before writing when needed

### `runtime_bindings`

Purpose:

- recoverable provider runtime metadata for a conversation

Fields:

- `conversationId`
- `userId`
- `provider`
- `status`
  - `"idle" | "active" | "expired" | "errored"`
- `providerThreadId`
  - optional
- `providerResumeToken`
  - optional JSON string
- `activeRunId`
  - optional
- `lastError`
  - optional
- `lastEventAt`
  - optional
- `expiresAt`
  - optional
- `updatedAt`

Indexes:

- `by_conversationId`
- `by_provider_and_status`

Notes:

- only recoverable runtime state belongs here
- live process handles do not belong here

## Relationship Between Messages, Runs, And Run Events

- a user message creates or triggers one run
- a run emits many run events
- a run usually produces one assistant message
- partial assistant output is visible in `messages`
- fine-grained runtime history lives in `run_events`

This is the chosen v1 model.

## Public Convex API

These functions are intended for clients:

- `conversations.listByAgent`
- `conversations.get`
- `conversations.create`
- `conversations.rename`
- `conversations.remove`
- `conversations.updateDraftSettings`
  - only allowed before `settingsLockedAt`
- `messages.listByConversation`
- `userDefaults.getGlobal`
- `userDefaults.setGlobal`
- `userDefaults.getForAgent`
- `userDefaults.setForAgent`
- `runtime.createBackendSessionToken`

Notes:

- `create` may create an empty conversation
- `updateDraftSettings` must reject updates after the first message locks settings

## Backend Ingress Boundary

`apps/server` needs a trusted path to persist runtime state.

V1 recommendation:

- expose backend-only HTTP ingress routes in `convex/http.ts`
- secure them with a backend secret or signed service token
- keep actual writes inside internal mutations and internal actions

Suggested ingress endpoints:

- `POST /runtime/run-started`
- `POST /runtime/message-delta`
- `POST /runtime/message-completed`
- `POST /runtime/run-completed`
- `POST /runtime/run-interrupted`
- `POST /runtime/run-failed`
- `POST /runtime/runtime-binding`

These endpoints should validate payloads tightly and delegate to internal functions.

## Internal Convex Functions

These functions are intended for backend ingress, not direct clients:

- `internal.conversations.lockSettingsIfNeeded`
- `internal.messages.createUserMessage`
- `internal.messages.upsertAssistantMessageChunk`
- `internal.messages.completeAssistantMessage`
- `internal.runs.create`
- `internal.runs.complete`
- `internal.runs.interrupt`
- `internal.runs.fail`
- `internal.runEvents.append`
- `internal.runtimeBindings.upsert`
- `internal.runtimeBindings.clearActiveRun`

## Deletion Rules

Conversation deletion is hard delete.

When deleting a conversation:

1. delete `run_events` in batches
2. delete `runs` in batches
3. delete `messages` in batches
4. delete `runtime_bindings`
5. delete the conversation

Use bounded batch processing and scheduling if the transaction size grows too large.

## Pagination Rules

- message lists must paginate
- conversation lists should paginate once counts justify it
- run event queries should paginate by `sequence` or `createdAt`

## Explicitly Out Of Scope

- alternate local persistence adapters
- provider process state inside Convex
- soft deletion
