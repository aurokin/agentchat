# Agentchat Architecture

This document describes the current high-level architecture of Agentchat.

Use it as the shortest system overview.
Use adjacent docs for detail:

- [Runtime And Auth Plan](./runtime-and-auth-plan.md) for current runtime and auth behavior
- [Convex Spec](./convex-spec.md) for persisted data and function surfaces
- [Backend API Spec](./backend-api-spec.md) for `apps/server` HTTP and WebSocket behavior
- [Codex Runtime Spec](./codex-runtime-spec.md) for provider-runtime specifics

## Core Components

### Clients

- web app
- mobile app

Responsibilities:

- authenticate as a concrete Convex user
- select an agent
- create or open conversations for that agent
- choose model and variant before the first message when the draft is still unlocked
- open authenticated backend WebSocket connections using short-lived backend tokens minted from Convex auth
- render streamed runtime events plus persisted conversation history
- subscribe to active conversations without owning execution

### Convex

Responsibilities:

- user identity and access resolution
- conversations, messages, runs, run events, and runtime bindings
- user-scoped authorization and multi-user isolation
- backend token issuance for `apps/server`
- conversation and workspace activity summaries derived from persisted runtime state

### Backend Server

Responsibilities:

- load server-managed auth, provider, and agent configuration
- validate backend tokens
- resolve agents and providers against the latest valid server config
- start, resume, interrupt, and expire provider runtimes
- stream normalized runtime events over WebSocket
- persist normalized runtime state back into Convex
- keep transient live-runtime state in memory

### Runtime Layer

Current runtime focus:

- Codex (active, production)

Planned runtimes:

- Pi (stdin/stdout RPC, nearest to Codex pattern)
- OpenCode (HTTP REST API server)
- Claude Code (subprocess per turn, CLI binary)

Responsibilities:

- hide runtime-specific protocol details behind backend-owned runtime behavior
- translate runtime events into Agentchat runtime events
- expose normalized model and variant metadata to the backend

Each runtime kind manages its own LLM provider connections internally. The runtime is an implementation detail of the agent, not a separate user-facing concept. See [Provider-Agent Merge Plan](../../plans/provider-agent-merge-plan.md) for the transition from the current provider-agent separation to the merged model.

## Runtime Model

Agentchat uses a backend-owned runtime model.

- after a send is accepted, execution belongs to `apps/server`
- Convex stores the durable user, conversation, run, event, and runtime-binding state
- clients are observers and input surfaces, not execution owners

Current runtime behavior:

- runs are user-scoped
- one conversation may have one active run at a time
- one user may have active runs in multiple conversations and multiple agents at once
- multiple clients for the same user may observe the same run concurrently
- runs may continue with zero active clients
- reconnecting clients recover from backend memory plus Convex persistence rather than restarting execution

## Conversation Flow

### Before First Message

1. The user signs in through Convex.
2. The client loads visible agents and provider metadata from `apps/server`.
3. The user selects an agent.
4. The user creates or opens a conversation for that agent.
5. The user may choose model and variant while the conversation is still unlocked.

### First Message

1. The user sends the first message.
2. The conversation locks its model and variant.
3. `apps/server` resolves the latest valid agent config and its inline runtime.
4. `apps/server` starts or resumes the provider runtime.
5. `apps/server` streams normalized events to subscribed clients.
6. `apps/server` persists normalized runtime state into Convex.

### While A Run Is Active

1. The backend keeps the runtime alive until the run completes, is interrupted, or expires.
2. The user may switch conversations or agents without canceling the run.
3. The user may send messages in other conversations while earlier runs continue.
4. Another client for the same user may subscribe and observe the same active run.
5. If all clients disconnect, the run may continue and later be recovered.

## Data Ownership

### Stored In Convex

- users
- conversations
- messages
- runs
- run events
- runtime bindings
- lightweight cross-client preferences such as favorite models

### Stored In Backend Memory

- live provider processes or sessions
- WebSocket subscriber bookkeeping
- in-flight stream buffering
- transient reconnect and recovery state

## Architectural Constraints

- every accepted request resolves to a concrete Convex user
- runtime state must remain user-scoped end to end
- conversations are agent-scoped
- model and variant lock after the first message
- the runtime kind is fixed by the agent and never changes for a conversation
- operator config changes still apply because the backend resolves the latest valid config on each run
- the product model stays runtime-agnostic through the `KindRuntime` interface
