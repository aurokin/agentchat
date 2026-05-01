# ACP Runtime Spec

## Purpose

This spec describes how Agentchat should support Agent Client Protocol runtimes.

ACP should be treated as a runtime protocol family behind agent-owned runtime
config. It should not be exposed as a user-facing provider choice.

ACP should also pressure-test the thin runtime contract. If ACP exposes session,
permission, plan, tool, or cancellation behavior that does not fit the current
contract, record it in
[Runtime Abstraction Pressure Log](./runtime-abstraction-pressure-log.md)
instead of forcing a lossy abstraction.

## Protocol Summary

ACP is a JSON-RPC protocol for editor/client to agent communication. The
important lifecycle for Agentchat is:

1. initialize and exchange capabilities
2. create or load a session
3. send a prompt turn
4. receive `session/update` notifications
5. cancel active turns with `session/cancel`

Local ACP agents generally use stdio transport. Remote transports are possible
but less mature and should not be required for the first Agentchat tracer.

Agentchat's ACP foundation lives in `apps/server/src/acpProtocol.ts`:

- `AcpProtocolClient` wraps the shared `JsonRpcStdioClient`
- `AcpProtocolClient.initialize` negotiates protocol version and capabilities
- `newSession`, `loadSession`, `prompt`, and `cancel` map the core ACP methods
- pure mapping helpers translate ACP updates/results into `RuntimeKindEvent`
  and provider artifacts

References:

- https://agentclientprotocol.com/protocol/overview
- https://agentclientprotocol.com/protocol/transports
- https://agentclientprotocol.com/protocol/session-setup
- https://agentclientprotocol.com/protocol/prompt-turn

## Runtime Unit

The first ACP implementation should use one ACP agent process per active
conversation unless a specific target proves that process-per-agent
multiplexing is safer.

The runtime binding stores the ACP session id plus bounded adapter metadata.

## Startup Flow

1. Load the selected agent runtime config.
2. Spawn the configured ACP agent process over stdio.
3. Send `initialize`.
4. Capture capabilities.
5. If a compatible session id exists and `agentCapabilities.loadSession` is
   advertised, call `session/load`.
6. Otherwise call `session/new`.
7. Persist the ACP session id in the runtime binding.

The foundation records newer ACP `session/resume` and `session/close`
capabilities but does not promote them into Agentchat runtime bindings yet.
Those behaviors should be validated by the first concrete ACP adapter tracer.

## Send Flow

1. Ensure the ACP runtime is initialized and has a session id.
2. Create a backend-owned run.
3. Send `session/prompt` with the user text.
4. Map `session/update` notifications into normalized Agentchat updates.
5. Persist provider artifacts for ACP-native plans, tool calls, permission
   requests, and stop reasons.
6. Complete, interrupt, or fail the run from the prompt response.

Unknown `session/update` variants must be preserved as provider artifacts
rather than flattened into assistant text.

## Interrupt Flow

1. Send `session/cancel`.
2. Mark pending tool calls or permission requests as cancelled internally.
3. Wait for the prompt response to return a cancellation stop reason when
   possible.
4. Fall back to process termination if the ACP agent does not settle.

## Event Mapping

| ACP message                          | Agentchat mapping                               |
| ------------------------------------ | ----------------------------------------------- |
| `session/update` agent message chunk | `message.delta`                                 |
| `session/update` plan                | provider artifact and optional assistant status |
| `session/update` tool call           | provider artifact                               |
| `session/update` tool call update    | provider artifact                               |
| `session/request_permission`         | auto-resolved or failed closed in v1            |
| `session/prompt` result `end_turn`   | `run.completed`                                 |
| `session/prompt` result `cancelled`  | `run.interrupted`                               |
| `session/prompt` error               | `run.failed`                                    |

## Permission Requests

Agentchat currently requires auto-approve runtime behavior and has no approval
UI. ACP permission requests should therefore be handled conservatively:

- `AcpProtocolClient` defaults to fail-closed permission handling
- auto-approve may select an explicit non-persistent allow option only when a
  concrete adapter opts into that mode
- auto-deny or fail closed where the permission request cannot be represented
  safely
- persist the request and resolution as provider artifacts

Approval UI is a separate future product feature.

## First Adapter Tracer

AUR-35 selected the generic local stdio ACP path as the first tracer. Local
source review did not find a currently available `pi-acp` or OpenCode ACP
surface; OpenClaw's `acpx` integration was the clearest available
ACP-compatible target family. The server implementation therefore keeps target
selection in operator config (`command`, `args`, `mcpServers`) while proving the
generic ACP lifecycle.

The first tracer should prove the generic ACP client/session/update machinery.
It should not attempt to support every ACP-compatible runtime.

## Non-Goals

- no user-facing runtime/protocol picker
- no approval UI
- no remote ACP transport requirement for the first tracer
- no hosted-product assumptions
