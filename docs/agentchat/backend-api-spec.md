# Agentchat Backend API Spec

## Purpose

This spec defines the client-facing HTTP and WebSocket API provided by `apps/server`.

The backend server is responsible for:

- exposing server-managed agents and providers
- opening and resuming provider runtimes
- streaming normalized events to clients
- interrupting in-flight runs

The backend does not replace Convex as the primary data store.

## Transport Model

Use a hybrid transport:

- HTTP for bootstrap and provider metadata
- one WebSocket connection per active access user for live runtime actions and events

Important rule:

- WebSocket connections are client subscriptions into backend-owned runtime state, not the execution container for a run

## Authentication Model

### Client To Convex

- the client authenticates with Convex as a concrete user
- today that user comes from Google auth or local auth
- the active product model is provider-oriented Google plus local-user auth, not a shared default-user mode

### Client To Backend

- the client requests a short-lived backend session token from Convex
- the client opens one WebSocket to `apps/server` using that token
- the same token may be used for authenticated backend HTTP routes if needed

Required backend token properties:

- `sub`
  - stable user subject
- `email`
- `exp`
- `iat`

Recommended token TTL:

- 5 minutes

## HTTP Endpoints

### `GET /api/bootstrap`

Purpose:

- bootstrap the signed-in session with the visible config needed to render the app shell

Returns:

- auth provider summary for the active instance access path
- visible agents
- provider summaries
- currently supported capabilities

Notes:

- no conversation history is returned here because Convex owns persistent data access
- `auth` should be treated as provider-oriented metadata, not a raw mode flag

### `GET /api/providers/:providerId/models`

Purpose:

- return cached normalized model and variant availability for one provider

Returns:

- provider id
- models
- variants per model
- cache metadata such as `fetchedAt` and `expiresAt`

Notes:

- the backend fetches and caches these from Codex
- agent-specific filtering happens server-side before the payload is returned

### `GET /api/agents/:agentId/options`

Purpose:

- return effective provider, model, and variant options for one agent after applying config filtering

Returns:

- allowed providers
- default provider
- effective model list
- effective variant list

## WebSocket Endpoint

### `GET /ws`

One connection per active access user.

The socket must support multiplexing multiple subscribed conversations.

Runs must continue even when zero sockets are currently subscribed.

## WebSocket Command Envelope

Every client command uses:

```json
{
  "id": "cmd_123",
  "type": "conversation.send",
  "payload": {}
}
```

Fields:

- `id`
  - client-generated command id
- `type`
  - command type string
- `payload`
  - command payload

## WebSocket Commands

### `connection.ping`

Purpose:

- heartbeat

### `conversation.subscribe`

Purpose:

- subscribe to live runtime events for one conversation

Payload:

- `conversationId`

Notes:

- subscribing must be idempotent
- subscribing must not itself start a run
- subscribing to a conversation with an active run should replay enough state for the client to render current progress safely

### `conversation.unsubscribe`

Purpose:

- stop receiving live runtime events for one conversation

Payload:

- `conversationId`

### `conversation.send`

Purpose:

- send a user message and start or resume the provider runtime if needed

Payload:

- `conversationId`
- `messageId`
  - Convex user message id
- `content`

Rules:

- only text input in v1
- provider, model, and variant must already be chosen on the conversation
- if settings are not locked yet, the backend must treat this as the locking message
- a successful send hands execution ownership to the backend
- the sending client does not need to remain subscribed for the run to finish

### `conversation.interrupt`

Purpose:

- interrupt the active run for a conversation

Payload:

- `conversationId`
- `runId`

### `provider.models.refresh`

Purpose:

- force a refresh of provider model metadata

Payload:

- `providerId`

Notes:

- useful for operator debugging
- may be hidden in the default UI but still useful in the protocol

## WebSocket Event Envelope

Every server event uses:

```json
{
  "type": "run.started",
  "payload": {}
}
```

## WebSocket Events

### Connection Events

- `connection.ready`
- `connection.error`
- `connection.pong`

### Conversation And Run Events

- `conversation.subscribed`
- `conversation.unsubscribed`
- `conversation.runtime.status`
- `run.started`
- `run.interrupted`
- `run.completed`
- `run.failed`

### Message Events

- `message.delta`
- `message.updated`
- `message.completed`

### Provider And Approval Events

- `provider.unavailable`
- `provider.models.updated`
- `approval.requested`
- `approval.resolved`
- `user_input.requested`
- `user_input.resolved`

Notes:

- approval and user-input events exist in the protocol even though v1 uses auto-approve and does not render special UI for them

## Event Semantics

- events must be normalized product events, not raw provider payloads
- payloads may include optional `providerMetadata` for debugging
- the client should not need to know Codex method names
- multiple clients subscribed to the same conversation should receive the same normalized event stream
- a reconnecting client should recover active run state without creating a duplicate run

Example `message.delta` payload:

```json
{
  "conversationId": "conv_123",
  "runId": "run_123",
  "messageId": "msg_456",
  "delta": "hello",
  "sequence": 12
}
```

## Backend Responsibilities On `conversation.send`

1. validate the user owns the conversation
2. ensure the conversation has provider, model, and variant selected
3. create or resume the runtime for that conversation
4. create a run record
5. start streaming normalized events
6. persist run and message state into Convex
7. emit WebSocket events to subscribed clients

Once step 4 succeeds, the backend owns execution for that run until it reaches a terminal state.

## Conversation Ownership

- the backend must validate conversation ownership using authenticated identity
- the backend must not trust a bare `conversationId` without lookup and ownership verification

## Failure Modes

Normalized failures should include:

- agent disabled
- provider disabled
- provider unavailable
- invalid conversation state
- runtime recovery failed
- run interrupted
- provider model unavailable

## Out Of Scope For V1

- multiple simultaneous active runs in one conversation
- raw provider event passthrough

## Behavioral Guarantees

- the backend owns execution after a send is accepted
- clients are allowed to switch conversations and agents while runs are active elsewhere
- the same user may have active runs in multiple conversations at once
- the same user may observe one run from multiple clients at once
- a run may outlive all currently connected clients as long as the backend runtime is healthy
