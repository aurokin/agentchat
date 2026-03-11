# Agentchat Codex Runtime Spec

## Purpose

This spec defines how `apps/server` should manage Codex as the first provider adapter behind the generic provider layer.

## Runtime Unit

The runtime unit is one live Codex app-server process per active conversation.

This is the chosen v1 behavior.

## Why This Unit

- conversation isolation is straightforward
- interruption maps cleanly to one active run
- recovery is simpler
- process cleanup is predictable

One global Codex process for all conversations is explicitly not the v1 design.

## Lifecycle Model

Agentchat uses a hybrid lifecycle:

- create a live Codex runtime when a conversation first needs one
- keep it warm for a provider-configured idle TTL
- shut it down after inactivity
- recreate and resume from persisted runtime binding when needed later

## States

Recommended runtime states:

- `idle`
- `starting`
- `active`
- `interrupting`
- `expired`
- `errored`

## Active Runtime State In Memory

Each live conversation runtime should keep:

- `conversationId`
- `providerId`
- `agentId`
- `rootPath`
- `processHandle`
- `status`
- `providerThreadId`
- `activeRunId`
- `lastActivityAt`
- `idleExpiresAt`
- `pendingApprovals`
- `pendingUserInputRequests`
- `socketSubscribers`

This state lives only in backend memory.

## Persisted Runtime Binding

The backend must persist enough data to recover a conversation:

- provider
- provider thread id
- provider resume token if available
- active run id if one exists
- last error
- expiration metadata

This state lives in Convex.

## Startup Flow

When a conversation needs a runtime:

1. load the current agent config from server config
2. confirm the agent and provider are enabled
3. read the runtime binding from Convex if one exists
4. start a new Codex app-server process
5. initialize the process
6. if a provider thread id exists, try `thread/resume`
7. if resume fails recoverably, fall back to `thread/start`
8. store the resulting thread id in the runtime binding

## Send Flow

When the user sends a message:

1. ensure the conversation runtime exists
2. create a run
3. create or update the assistant message placeholder
4. send `turn/start` to Codex
5. map incoming Codex notifications into normalized events
6. stream those events to WebSocket subscribers
7. persist selected event history into Convex
8. complete or fail the run

## Interrupt Flow

When the user interrupts a run:

1. find the active runtime by conversation id
2. read the active provider turn id
3. send `turn/interrupt`
4. update run status to `interrupted`
5. leave the partial assistant message visible
6. emit normalized interruption events

## Idle Expiration Flow

When a runtime passes its idle TTL:

1. confirm there is no active run
2. mark the runtime binding as expired or idle
3. stop the Codex process
4. remove the in-memory runtime record

The next send recreates the process and resumes from the binding.

## Model And Variant Handling

V1 should lean on Codex for the model catalog.

Recommended behavior:

- fetch model metadata from Codex through the provider adapter
- cache it for the provider's configured model cache TTL
- normalize the response into Agentchat provider, model, and variant options
- apply agent-level filtering before returning options to clients

Variant rules:

- `variant` is stored as a provider-defined id string
- the Codex adapter maps variant ids to Codex-specific execution parameters
- the client must not hardcode Codex parameter names

## Suggested Variant Mapping

The exact Codex mapping may evolve, but the adapter should own it.

Examples:

- a `variant` may map to reasoning effort
- a `variant` may map to collaboration mode presets
- a `variant` may map to both

The conversation stores only the chosen variant id.

## Event Mapping

The Codex adapter should convert provider events into normalized events such as:

- `run.started`
- `message.delta`
- `message.completed`
- `run.completed`
- `run.interrupted`
- `run.failed`
- `approval.requested`
- `user_input.requested`

Raw Codex event names should remain inside the adapter.

## Approval Handling

V1 assumes auto-approve.

That means:

- the adapter should still recognize approval and user-input request events
- the runtime should resolve them automatically when possible
- the internal event model should preserve them
- the UI does not need explicit approval controls in v1

## Error Handling

Distinguish between:

- recoverable resume failure
- process startup failure
- invalid model selection
- disabled provider
- disabled agent
- interrupted run
- provider protocol error

Recoverable resume failure should fall back to a fresh thread start.

## Resource Limits

The implementation should support:

- per-provider idle TTL
- per-provider model cache TTL
- one active run per conversation
- bounded reconnect and retry behavior

## Logging

Each run should log enough information to debug production issues:

- conversation id
- user subject or email
- provider id
- agent id
- provider thread id
- provider turn id
- lifecycle transitions
- error reason

## Future Compatibility

This lifecycle spec is written so OpenCode can fit later.

To preserve that:

- keep the provider adapter interface generic
- do not bake Codex thread names into domain models
- treat `providerThreadId` as provider-owned state behind a generic binding
