# Agentchat Product Rules

This document records user-facing rules and product decisions that should remain stable during implementation.

## Access And Identity

- Access is controlled per instance.
- The supported access modes are allowlisted Google auth and disabled-auth default-user mode.
- Convex is the primary authority for whether a user is allowed into the app.
- The backend must enforce the same identity on every request as defense in depth.

## Agent Selection

- An agent must always be selected before the user can work with conversations.
- Agent selection should live in a persistent part of the UI, likely near the user profile in the lower-left sidebar area.
- Switching agents changes the active conversation set because conversations are bound to agents.
- If the selected agent has no open conversation in view, the user should be able to start an empty conversation for that agent.

## Conversations

- Every conversation belongs to exactly one agent.
- Users can have multiple concurrent conversations with the same agent.
- Users can have active runs in multiple conversations at the same time.
- Users can have active runs under multiple agents at the same time.
- Selecting an agent can open or create an empty conversation shell, but it must not start a provider runtime session by itself.
- A provider runtime session is created or resumed only when the user sends the first message in that conversation.

## Provider, Model, And Variant Selection

- Providers are configured by the backend server, not by end users.
- Provider choice must happen before the first message in a conversation.
- Model choice must happen before the first message in a conversation.
- Variant choice must happen before the first message in a conversation.
- Provider, model, and variant are locked once the first message is sent.
- Available models and variants are defined by the selected provider.
- Web search should not be exposed as a user toggle.

## Server Configuration Behavior

- Conversations always adopt the latest server configuration for their agent.
- If a provider is disabled or reconfigured by the operator, existing conversations must adapt to that change.
- Users should not be able to change provider, model, or variant mid-conversation even though operator changes still apply.

## Runtime Behavior

- Realtime streaming is required.
- WebSocket is the realtime transport between clients and the backend server.
- The backend owns runtime lifecycle after a message is accepted.
- A client is an observer and input surface, not the owner of a run.
- Runs must continue safely if the user navigates away, switches agents, switches conversations, closes all clients, or reconnects from another client later.
- Users must be able to switch conversations while a send is in flight.
- Users must be able to switch agents while runs continue in other conversations.
- Multiple clients for the same user must be able to observe the same run concurrently.
- Web and mobile must be treated as equivalent subscribers to backend-owned runtime state.
- The application assumes automatic approval mode for provider actions in v1.
- Auto-approve is a project requirement for the current scope, not a temporary UI default.

## Data Rules

- Conversation history is stored in Convex.
- Auth and user identity are stored in Convex.
- Recoverable runtime metadata may be stored in Convex.
- Transient runtime process state should stay in backend memory.

## Explicitly Deferred

- Attachments
- Conversation branching
- Provider approval UX
- Admin interface for managing agents
- Additional providers beyond Codex
