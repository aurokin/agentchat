# Runtime Abstraction Pressure Log

Use this log while implementing Claude Code, ACP, Pi, OpenCode, or any other
runtime adapter. Its purpose is to preserve protocol fidelity while the shared
runtime abstraction is still thin.

Do not force a runtime capability into the shared contract just because it is
awkward today. Record the pressure first, ship the tracer with bounded
provider artifacts or adapter-local behavior when safe, then revisit the
contract during the Runtime Abstraction Retrospective.

## How To Use This Log

Add an entry when an implementation finds any of these:

- a provider capability that does not fit normalized Agentchat events
- adapter state that does not fit current runtime binding fields
- protocol behavior that requires an adapter-specific branch
- information preserved only in provider artifacts
- a capability skipped because the abstraction cannot express it yet
- a place where the abstraction causes fidelity loss or awkward code

Every meaningful entry should end with one of these dispositions:

- keep adapter-specific
- promote to shared contract
- change persistence/schema
- change transport substrate
- implement later
- reject as out of scope

## Entry Template

```md
### YYYY-MM-DD - Adapter - Capability

Linear issue:

Adapter:

Capability or protocol feature:

Current fit:
Fits / awkward / does not fit

What we did:
Normalized event / provider artifact / adapter-specific branch / skipped

Fidelity risk:

Follow-up:
Keep adapter-specific / promote to shared contract / change persistence/schema /
change transport substrate / implement later / reject
```

## AUR-143 Final Classification

The Runtime Abstraction Retrospective classified the current open pressure as:

| Entry | Disposition |
| --- | --- |
| Claude Code - Late Session Identity | Change persistence/schema later. Current `providerThreadId` remains as a compatibility field and is treated semantically as provider conversation identity. |
| Claude Code - Non-Text Stream Content | Keep adapter-specific through provider artifacts. Do not add shared tool UX yet. |
| Claude Code - Interrupt Signal Semantics | Change transport substrate later only if real CLI testing proves a custom signal policy is needed. |
| ACP - Session Resume And Close | Implement later only when a concrete ACP target needs richer lifecycle semantics. |
| ACP - Permission Requests Without Approval UI | Implement later with approval UI or a richer permission contract; keep current fail-closed/non-persistent auto-approve behavior. |
| ACP - Unstable Elicitation And Auxiliary Client Requests | Implement later only when a real ACP target requires these client-handled requests. |
| ACP - Target Selection Through Operator Config | Keep adapter-specific as raw operator config. No typed profile layer yet. |
| ACP - Session Load Without Resume Or Close Semantics | Keep adapter-specific; stale load fallback heals bindings without schema changes. |
| ACP - Prompt Cancellation Fallback | Keep adapter-specific; promote only if another adapter needs the same cancellation knobs. |

The full decision record is
[Runtime Abstraction Retrospective](./runtime-abstraction-retrospective.md).

## Entries

### 2026-04-29 - Claude Code - Late Session Identity

Linear issue:
AUR-10

Adapter:
Claude Code runtime tracer

Capability or protocol feature:
Claude Code only reveals the durable `session_id` after the per-turn process
starts streaming.

Current fit:
Awkward

What we did:
Opened first-turn conversations with a temporary adapter-local pending thread
id, then emitted a provider identity update when the stream revealed
`session_id`. The existing runtime binding stores that value in
`providerThreadId`.

Fidelity risk:
`providerThreadId` now represents Codex thread ids and Claude session ids. That
is functionally correct for resumption, but the field name hides a real
protocol distinction.

Follow-up:
Change persistence/schema or promote a neutral provider session identity during
AUR-143 if ACP adds the same pressure.

### 2026-04-29 - Claude Code - Non-Text Stream Content

Linear issue:
AUR-10

Adapter:
Claude Code runtime tracer

Capability or protocol feature:
Claude Code stream-json can include tool use, tool result, usage, and unknown
event payloads that are not assistant text.

Current fit:
Fits through provider artifacts

What we did:
Normalized text blocks into assistant deltas and preserved non-text or unknown
stream events as Claude provider artifacts.

Fidelity risk:
Tool-specific UX remains unavailable until a shared tool/update contract is
earned by multiple adapters.

Follow-up:
Keep adapter-specific unless AUR-35 and AUR-143 prove a shared tool event model
is worth promoting.

### 2026-04-29 - Claude Code - Interrupt Signal Semantics

Linear issue:
AUR-10

Adapter:
Claude Code runtime tracer

Capability or protocol feature:
The Claude spec prefers a graceful interrupt signal before harder process
termination.

Current fit:
Awkward

What we did:
Used the shared `ManagedRuntimeProcess.stop()` behavior, which currently sends
SIGTERM and escalates to SIGKILL. The tracer records interruption status through
the normalized runtime event path.

Fidelity risk:
If Claude Code treats SIGINT differently from SIGTERM for session preservation
or cleanup, current interruption may be less graceful than the native CLI
expects.

Follow-up:
Change transport substrate if real CLI testing shows SIGINT is materially
better for Claude Code or another adapter.

### 2026-04-26 - ACP - Session Resume And Close

Linear issue:
AUR-142

Adapter:
Generic ACP protocol foundation

Capability or protocol feature:
ACP advertises `sessionCapabilities.resume` and `sessionCapabilities.close`.

Current fit:
Awkward

What we did:
Preserved advertised capabilities in the ACP initialize result, but did not
promote resume/close semantics into Agentchat runtime bindings or lifecycle
methods.

Fidelity risk:
A concrete ACP adapter may need resume-without-replay or close semantics that
are different from current `providerThreadId` and `stop` behavior.

Follow-up:
Implement later during AUR-35 if the selected adapter supports these
capabilities; then classify during AUR-143 as keep adapter-specific, promote to
shared contract, or change persistence/schema.

### 2026-04-26 - ACP - Permission Requests Without Approval UI

Linear issue:
AUR-142

Adapter:
Generic ACP protocol foundation

Capability or protocol feature:
`session/request_permission`

Current fit:
Awkward

What we did:
Added protocol handling and provider artifacts. The foundation defaults to
fail-closed permission resolution, with an explicit auto-approve mode that only
selects non-persistent allow options when a concrete adapter opts in.

Fidelity risk:
Without approval UI, ACP permission semantics cannot be faithfully represented
for requests that need user review or richer option metadata.

Follow-up:
Keep adapter-specific until approval UI exists or AUR-143 promotes a richer
permission contract.

### 2026-04-26 - ACP - Unstable Elicitation And Auxiliary Client Requests

Linear issue:
AUR-142

Adapter:
Generic ACP protocol foundation

Capability or protocol feature:
ACP includes unstable or auxiliary client-handled requests such as
`session/elicitation`, file-system requests, and terminal requests.

Current fit:
Does not fit

What we did:
Skipped these requests in the generic foundation. Unsupported incoming requests
return a protocol error through the JSON-RPC transport.

Fidelity risk:
The first concrete ACP adapter may rely on one of these client-handled request
families for useful operation.

Follow-up:
Implement later only when AUR-35 proves a selected adapter needs the capability.
Classify the result during AUR-143.

### 2026-04-30 - ACP - Target Selection Through Operator Config

Linear issue:
AUR-35

Adapter:
Generic ACP runtime adapter

Capability or protocol feature:
Concrete ACP target selection

Current fit:
Fits

What we did:
Local review did not find an available `pi-acp` or OpenCode ACP surface.
OpenClaw's `acpx` integration is the clearest currently identified
ACP-compatible target family, so the implementation keeps the selected target
in agent runtime config (`command`, `args`, and optional `mcpServers`) instead
of hardcoding an adapter-specific wrapper.

Fidelity risk:
Target-specific launch conventions may need richer config once a real `pi-acp`
or OpenCode ACP surface exists.

Follow-up:
During AUR-143, decide whether ACP target selection stays raw command config or
gets a small typed profile layer after real adapter usage proves the shape.

### 2026-04-30 - ACP - Session Load Without Resume Or Close Semantics

Linear issue:
AUR-35

Adapter:
Generic ACP runtime adapter

Capability or protocol feature:
`session/load`, `sessionCapabilities.resume`, and `sessionCapabilities.close`

Current fit:
Awkward

What we did:
The runtime loads a persisted ACP session id through `session/load` when the
agent advertises that capability. If it does not, Agentchat creates a fresh ACP
session and records a provider artifact. Newer resume and close capability
metadata remains provider-specific.

Fidelity risk:
Some ACP targets may need resume tokens, close requests, or adapter metadata
that cannot be represented by the current `providerThreadId` binding alone.

Follow-up:
Classify during AUR-143 after testing a real ACP target. Promote only the
minimum persistence fields needed by more than one runtime.

### 2026-04-30 - ACP - Prompt Cancellation Fallback

Linear issue:
AUR-35

Adapter:
Generic ACP runtime adapter

Capability or protocol feature:
`session/cancel`

Current fit:
Awkward

What we did:
Interrupts send `session/cancel` first and then stop the ACP process if the
prompt does not settle inside the configured timeout. This preserves the
normalized Agentchat interrupt behavior without adding ACP-specific UI.

Fidelity risk:
For persistent ACP agents, killing the process can discard agent-local session
state if the target ignores `session/cancel`.

Follow-up:
Use real adapter testing to decide whether the shared runtime contract needs a
separate cooperative-cancel timeout or whether this remains ACP-specific.
