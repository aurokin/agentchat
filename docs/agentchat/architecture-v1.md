# Agentchat Architecture V1

## Summary

Agentchat is moving to a split architecture:

- Convex stores identity, conversations, messages, and persisted runtime metadata.
- An instance-local TypeScript backend server brokers all provider runtime communication.
- Codex is the only provider implemented in v1.
- The backend is designed behind a provider interface so OpenCode can be added later without reworking the product model.

## Core Components

### Clients

- Web app
- Mobile app

Responsibilities:

- Authenticate with Convex or initialize the default workspace user when auth is disabled
- Let the user select an agent
- Let the user select provider, model, and variant before the first message
- Open a backend WebSocket connection using a short-lived backend token derived from Convex auth
- Render streamed run events and persisted conversation history

### Convex

Responsibilities:

- Google-based auth or disabled-auth default-user mode
- Instance allowlist enforcement
- User identity
- Conversations
- Messages
- Runs
- Run events
- Runtime bindings
- User defaults such as preferred provider, model, and variant

### Backend Server

Responsibilities:

- Load provider and agent configuration from a top-level server config file
- Validate backend tokens from authenticated clients
- Resolve the selected agent to current server config
- Open or resume provider runtimes
- Stream runtime events over WebSocket
- Persist normalized run and message state into Convex
- Keep transient runtime process state in memory

### Provider Layer

Responsibilities:

- Present a provider-agnostic runtime interface to the backend
- Hide provider-specific concepts such as Codex thread ids or OpenCode session ids
- Convert provider events into normalized Agentchat run events

## Canonical Runtime Flow

### Before First Message

1. The user signs in through Convex, or the default workspace user is initialized if auth is disabled.
2. The client loads the available agents from the backend.
3. The user selects an agent.
4. The client shows only conversations for that agent.
5. The user may create or open an empty conversation for that agent.
6. The user selects provider, model, and variant for the conversation draft.
7. No provider runtime is started yet.

### First Message

1. The user sends the first message.
2. The conversation locks provider, model, and variant.
3. The backend resolves the latest server config for the agent.
4. The backend ensures a runtime binding exists for the conversation.
5. The backend starts or resumes the Codex runtime.
6. The backend sends the message as a provider turn.
7. The backend streams normalized events to the client over WebSocket.
8. The backend persists messages, runs, and run events into Convex.

### Later Messages

1. The user reopens the conversation.
2. The backend reads the runtime binding from Convex.
3. If the runtime process is gone, the backend recreates it from persisted runtime metadata.
4. The backend sends the next turn and continues streaming.

## Data Ownership

### Stored In Convex

- Users
- Conversations
- Messages
- Runs
- Run events
- Runtime bindings
- User defaults

### Stored In Backend Memory Only

- Live Codex child processes
- WebSocket subscriber lists
- In-flight stream buffers
- Pending provider approval or user-input requests
- Heartbeats and reconnect bookkeeping

## Runtime State Decision

Agentchat should use a hybrid model:

- Persist recoverable runtime metadata in Convex.
- Keep transient runtime process state in backend memory.

This avoids treating the backend as the source of truth while still allowing reconnect and recovery after process restarts.

## Suggested Convex Entity Set

- `user_defaults`
  - per-user default provider, model, and variant
- `conversations`
  - user-owned threads bound to one agent
- `messages`
  - persisted user and assistant messages
- `runs`
  - one assistant execution per user turn
- `run_events`
  - append-only normalized runtime events
- `runtime_bindings`
  - provider-specific recovery data for a conversation

## Runtime Binding Shape

Recommended fields:

- `conversationId`
- `provider`
- `providerThreadId`
- `providerResumeToken`
- `status`
- `activeRunId`
- `lastError`
- `lastEventAt`
- `updatedAt`

For Codex v1, `providerThreadId` is the most important durable field. `providerResumeToken` should still exist as a generic field so the abstraction survives future providers.

## Provider Interface

The backend should code against an interface shaped roughly like this:

- `openConversationRuntime(conversationId)`
- `resumeConversationRuntime(conversationId)`
- `sendConversationMessage(conversationId, text)`
- `interruptConversationRun(conversationId, runId)`
- `subscribeConversationEvents(conversationId)`

These names are product-oriented. Each provider adapter can map them to its own protocol.

## Codex Mapping

Codex v1 should map the provider interface to:

- `thread/start` or `thread/resume`
- `turn/start`
- `turn/interrupt`
- streamed `turn/*` and `item/*` notifications

## Future OpenCode Support

OpenCode is not part of v1 implementation, but the design must leave room for it.

That means:

- never hardcode Codex-only names into product entities
- keep provider ids explicit in data models
- treat model and variant availability as provider-defined
- keep runtime bindings provider-agnostic even if Codex is the first adapter

## Configuration Model

The server should use one top-level config file with sections for:

- `providers`
- `agents`
- `auth`

Agents should reference provider ids instead of embedding provider definitions inline. This keeps the config reusable when multiple agents share the same provider configuration.

## Constraints

- Conversations adopt the latest server config for their agent
- Users cannot change provider, model, or variant after the first message
- Attachments are out of scope for v1
- Branching is out of scope for v1
- Auto-approve is assumed for v1
