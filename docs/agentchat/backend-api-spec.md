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
- one WebSocket connection per signed-in user for live runtime actions and events

## Authentication Model

### Client To Convex

- the client authenticates with Convex using Google-backed auth

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

- user identity summary
- visible agents
- provider summaries
- currently supported capabilities

Notes:

- no conversation history is returned here because Convex owns persistent data access

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

One connection per signed-in user.

The socket must support multiplexing multiple subscribed conversations.

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
- may be disabled in production UI but still useful in the protocol

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

- attachments
- multiple simultaneous active runs in one conversation
- raw provider event passthrough
