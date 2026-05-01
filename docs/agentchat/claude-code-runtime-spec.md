# Agentchat Claude Code Runtime Spec

## Purpose

This spec defines how `apps/server` should manage Claude Code as a runtime adapter.

Claude Code is Anthropic's CLI coding agent. Unlike Codex, Pi, and OpenCode, Claude Code does not have a persistent server mode. Integration uses the CLI binary in print mode with session resumption, spawning a subprocess per turn.

Implementation should follow the
[Runtime Protocol Expansion Plan](./runtime-protocol-expansion-plan.md). Claude
Code is a tracer on top of the shared runtime contract and JSONL subprocess
transport, not the abstraction that should define the contract by itself.
If Claude Code exposes capabilities that do not fit the thin scaffold, record
them in
[Runtime Abstraction Pressure Log](./runtime-abstraction-pressure-log.md)
instead of flattening away protocol fidelity.

Prerequisites:

- [Runtime Kind Contract](./runtime-kind-contract.md) supports per-turn
  subprocess runtimes and generic session bindings.
- Shared transport helpers can spawn a subprocess, parse JSONL stdout, capture
  stderr, handle cancellation, and enforce timeouts.
- Provider artifact persistence remains available for Claude stream-json
  metadata.

## Why Claude Code

- Users with a Claude Max or Pro subscription can use Claude Code at no additional API cost. This is the primary value proposition.
- The `claude` binary authenticates via the user's `~/.claude/` credentials, not API keys.
- Supports session persistence by passing the captured session id to
  `--resume <sessionId>`.
- Streaming structured output via `--output-format stream-json`.

## Critical Constraint: Subscription Only

The `claude` binary uses the operator's Claude subscription credentials stored in `~/.claude/`. The Claude Agent SDK (`@anthropic-ai/claude-code`) requires API keys and does not support subscription auth.

This means:

- The CLI binary is the only viable integration path for subscription-based usage.
- The binary must run under the same OS user that authenticated with `claude auth`.
- API key costs are avoided, but the operator's subscription rate limits apply.
- Each agentchat server instance is tied to one Claude subscription.

## Runtime Unit

One `claude` subprocess per turn, not per conversation.

This is fundamentally different from Codex, Pi, and OpenCode where a persistent process handles multiple turns. With Claude Code, each turn spawns a fresh process that resumes the session via `--resume <sessionId>`.

This difference must stay adapter-specific. Product code should depend on the
shared prompt-turn contract rather than checking for Claude Code lifecycle
details.

## Protocol

Claude Code's print mode emits newline-delimited JSON to stdout.

### Invocation

```bash
claude --print \
  --output-format stream-json \
  --include-partial-messages \
  --resume <sessionId> \
  --model <model> \
  --permission-mode <mode>
```

Key flags:

- `--print`: non-interactive mode, output to stdout.
- `--output-format stream-json`: JSONL streaming output.
- `--resume <sessionId>`: resume a specific session for conversation continuity.
- `--model <model>`: model selection. Agentchat can use configured model ids or Claude Code aliases such as `sonnet` and `opus`.
- `--permission-mode <mode>`: permission behavior (`acceptEdits`, `bypassPermissions`, `plan`, or omitted for Claude Code's default).
- `--max-budget-usd <amount>`: optional cost cap per turn.
- `--include-partial-messages`: include partial content blocks for real-time streaming.

Agentchat sends prompt text over stdin, not argv. This avoids OS argument
length limits and keeps prompt contents out of process listings.

### Stream Events (stdout)

```json
{"type": "system", "subtype": "init", "session_id": "abc123", ...}
{"type": "assistant", "message": {"content": [{"type": "text", "text": "partial..."}]}, ...}
{"type": "assistant", "message": {"content": [{"type": "tool_use", "name": "Read", "input": {...}}]}, ...}
{"type": "tool_result", "content": "file contents...", ...}
{"type": "result", "result": "final output text", "session_id": "abc123", ...}
```

### Session ID Capture

On the first turn of a conversation:

1. Omit `--resume`.
2. Capture the `session_id` from the `init` event.
3. Store it in the runtime binding.

On subsequent turns:

1. Pass `--resume <stored-id>`.
2. Claude Code resumes context from its internal session storage.

## Lifecycle Model

Different from other runtimes due to the subprocess-per-turn model:

- No persistent process to keep warm or expire.
- No idle TTL needed.
- Session state lives in Claude Code's own storage (`~/.claude/projects/`).
- The runtime binding stores only the `sessionId` for continuity.

### States

Simplified state set:

- `idle`: no turn in progress.
- `active`: subprocess running for a turn.
- `interrupting`: subprocess being terminated.
- `errored`: last turn failed.

No `starting` or `expired` states because there is no persistent process.

## Startup Flow

There is no separate startup flow. The first `conversation.send` spawns the first subprocess.

1. Load the agent config.
2. Confirm the agent is enabled.
3. Read the runtime binding from Convex if one exists.
4. If no session id exists, the first send will capture one.

## Send Flow

1. Check that no turn is already active for this conversation.
2. Create a run.
3. Build the CLI invocation:
    - If session id exists: include `--resume <sessionId>`.
    - If no session id: omit them (first turn).
4. Spawn the subprocess.
5. Parse JSONL events from stdout.
6. On `init` event: capture and store `session_id` if not already stored.
7. Map events to normalized Agentchat events.
8. Persist to Convex.
9. Complete the run when the process exits with code 0.
10. Fail the run if the process exits with a non-zero code.

## Interrupt Flow

1. Request subprocess stop through the shared process transport.
2. Send `SIGTERM`.
3. Escalate to `SIGKILL` if the process has not exited.
4. Update run status to `interrupted`.
5. Emit normalized interruption events.
6. The session state is preserved by Claude Code for future resumption.

AUR-143 keeps custom signal policy out of the shared contract for now. If real
Claude CLI testing proves `SIGINT` preserves session state more reliably than
the shared stop behavior, add a narrow transport-substrate follow-up.

## Event Mapping

| Claude Code Event                   | Agentchat Event                       |
| ----------------------------------- | ------------------------------------- |
| `system` / `init` with `session_id` | Internal (capture session id)         |
| `assistant` (text content)          | `message.delta`                       |
| `assistant` (tool_use content)      | Provider artifact                     |
| `tool_result`                       | Provider artifact                     |
| `result`                            | `message.completed` + `run.completed` |
| Process exit code 0                 | `run.completed`                       |
| Process exit non-zero               | `run.failed`                          |

## Model And Variant Handling

The model catalog for Claude Code should be:

- Statically configured in the runtime adapter or agent config.
- No dynamic model fetching needed.
- `modelCacheTtlSeconds` still applies but the "fetch" is a no-op returning the static list.

The current tracer exposes static fallback aliases for `sonnet` and `opus`, and
prefers explicitly configured model ids when operators need exact Claude model
names.

Variants for Claude Code are limited. Claude Code does not expose a reasoning effort parameter in the same way Codex does. Possible variant mappings:

- `default`: standard behavior.
- `plan`: use `--permission-mode plan` for read-only analysis.

Or variants may simply not apply, with the model being the only user-selectable dimension.

## Session Management

Claude Code manages its own session storage:

- Sessions stored in `~/.claude/projects/<encoded-cwd>/`.
- Session ids are opaque strings.
- Context survives across subprocess invocations via `--resume <sessionId>`.
- Claude Code handles its own context window management internally.

The Agentchat adapter stores only the `sessionId` string in the runtime binding.
Current storage uses the compatibility `providerThreadId` field; the
runtime-kind contract treats that field semantically as provider conversation
identity until a future schema migration justifies a neutral name.

### Session Limitations

- Session storage is filesystem-based, not database-backed.
- Sessions are scoped to the working directory.
- There is no API to list or manage sessions programmatically.
- If session storage is corrupted or cleared, the conversation loses context (but message history in Convex is unaffected).

## Configuration

Inline agent runtime config for Claude Code:

```json
{
    "kind": "claude-code",
    "command": "claude",
    "args": [],
    "baseEnv": {},
    "permissionMode": "auto",
    "modelCacheTtlSeconds": 300
}
```

- `command`: binary name or absolute path to the `claude` CLI.
- `args`: additional CLI arguments appended to every invocation.
- `baseEnv`: environment overrides.
- `permissionMode`: default permission mode. Agentchat maps `auto` to
  `acceptEdits`, maps `dontAsk` to `bypassPermissions`, and lets the `plan`
  variant override the configured permission mode.

Top-level provider config uses the same provider wrapper as other runtimes, with
Claude-specific process settings under `claudeCode`.

`idleTtlSeconds` remains in the shared provider shape but has no persistent
process to expire for Claude Code.

The agent's `rootPath` is passed as the working directory for the subprocess.

## Error Handling

- Process startup failure: `claude` binary not found or not authenticated.
- Non-zero exit code: map to `run.failed` with stderr as error message.
- Session resumption failure: if `--resume` fails, fall back to a fresh session (lose provider-side context, Convex history remains).
- Subscription rate limit: Claude Code may refuse to start if the subscription is exhausted. Surface as `provider.unavailable`.
- Timeout: set a reasonable per-turn timeout. If the process exceeds it, treat as a failed run.

## Stability Risks

Claude Code's CLI is a user-facing tool, not a documented embedding API:

- The `--output-format stream-json` format may change between CLI versions.
- The `--resume` behavior may change.
- The set of available flags may change.

Mitigations:

- Pin the `claude` CLI version in operator environments.
- Wrap the output parser with version-aware logic if format changes are detected.
- Integration tests should exercise the actual CLI output format.
- Treat this integration as best-effort and document the dependency on CLI stability.

## Future Considerations

- If Anthropic ships a persistent server mode or subscription-compatible SDK, the adapter should migrate to that.
- Claude Code's `--max-budget-usd` flag could be exposed as an operator-configurable cost cap per turn.
- Claude Code supports `--fork-session` which could map to conversation branching if that feature is added later.
