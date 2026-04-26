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

No pressure entries have been recorded yet. Claude Code and ACP implementation
tickets are expected to add entries here when the thin scaffold does not fit
real protocol behavior.

