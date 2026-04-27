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

## Open Entries

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
