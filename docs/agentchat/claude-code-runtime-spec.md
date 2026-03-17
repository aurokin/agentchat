# Agentchat Claude Code Runtime Spec

## Purpose

This spec defines how `apps/server` should manage Claude Code as a runtime adapter.

Claude Code is Anthropic's CLI coding agent. Unlike Codex, Pi, and OpenCode, Claude Code does not have a persistent server mode. Integration uses the CLI binary in print mode with session resumption, spawning a subprocess per turn.

## Why Claude Code

- Users with a Claude Max or Pro subscription can use Claude Code at no additional API cost. This is the primary value proposition.
- The `claude` binary authenticates via the user's `~/.claude/` credentials, not API keys.
- Supports session persistence via `--session-id` and `--resume`.
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

This is fundamentally different from Codex, Pi, and OpenCode where a persistent process handles multiple turns. With Claude Code, each turn spawns a fresh process that resumes the session via `--session-id`.

## Protocol

Claude Code's print mode emits newline-delimited JSON to stdout.

### Invocation

```bash
claude --print \
  --output-format stream-json \
  --session-id <sessionId> \
  --resume \
  --model <model> \
  --permission-mode <mode> \
  "user message"
```

Key flags:

- `--print`: non-interactive mode, output to stdout.
- `--output-format stream-json`: JSONL streaming output.
- `--session-id <id>`: resume a specific session for conversation continuity.
- `--resume`: continue from the last session state.
- `--model <model>`: model selection (e.g., `claude-sonnet-4-6`, `claude-opus-4-6`).
- `--permission-mode <mode>`: permission behavior (`auto`, `acceptEdits`, `bypassPermissions`, `plan`).
- `--max-budget-usd <amount>`: optional cost cap per turn.
- `--include-partial-messages`: include partial content blocks for real-time streaming.

### Stream Events (stdout)

```json
{"type": "init", "session_id": "abc123", ...}
{"type": "assistant", "message": {"content": [{"type": "text", "text": "partial..."}]}, ...}
{"type": "assistant", "message": {"content": [{"type": "tool_use", "name": "Read", "input": {...}}]}, ...}
{"type": "tool_result", "content": "file contents...", ...}
{"type": "result", "result": "final output text", "session_id": "abc123", ...}
```

### Session ID Capture

On the first turn of a conversation:

1. Omit `--session-id` and `--resume`.
2. Capture the `session_id` from the `init` event.
3. Store it in the runtime binding.

On subsequent turns:

1. Pass `--session-id <stored-id> --resume`.
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
   - If session id exists: include `--session-id` and `--resume`.
   - If no session id: omit them (first turn).
4. Spawn the subprocess.
5. Parse JSONL events from stdout.
6. On `init` event: capture and store `session_id` if not already stored.
7. Map events to normalized Agentchat events.
8. Persist to Convex.
9. Complete the run when the process exits with code 0.
10. Fail the run if the process exits with a non-zero code.

## Interrupt Flow

1. Send `SIGINT` to the subprocess.
2. Wait briefly for graceful shutdown.
3. Send `SIGTERM` if the process has not exited.
4. Update run status to `interrupted`.
5. Emit normalized interruption events.
6. The session state is preserved by Claude Code for future resumption.

## Event Mapping

| Claude Code Event | Agentchat Event |
|-------------------|-----------------|
| `init` | Internal (capture session id) |
| `assistant` (text content) | `message.delta` |
| `assistant` (tool_use content) | `message.delta` (tool use metadata) |
| `tool_result` | `message.delta` (tool result metadata) |
| `result` | `message.completed` + `run.completed` |
| Process exit code 0 | `run.completed` |
| Process exit non-zero | `run.failed` |

## Model And Variant Handling

Claude Code supports a small, static set of models:

- `claude-opus-4-6`
- `claude-sonnet-4-6`
- `claude-haiku-4-5-20251001`

And their dated variants as they are released.

The model catalog for Claude Code should be:

- Statically configured in the runtime spec or agent config.
- No dynamic model fetching needed.
- `modelCacheTtlSeconds` still applies but the "fetch" is a no-op returning the static list.

Variants for Claude Code are limited. Claude Code does not expose a reasoning effort parameter in the same way Codex does. Possible variant mappings:

- `default`: standard behavior.
- `plan`: use `--permission-mode plan` for read-only analysis.

Or variants may simply not apply, with the model being the only user-selectable dimension.

## Session Management

Claude Code manages its own session storage:

- Sessions stored in `~/.claude/projects/<encoded-cwd>/`.
- Session ids are opaque strings.
- Context survives across subprocess invocations via `--session-id --resume`.
- Claude Code handles its own context window management internally.

The Agentchat adapter stores only the `sessionId` string in the runtime binding.

### Session Limitations

- Session storage is filesystem-based, not database-backed.
- Sessions are scoped to the working directory.
- There is no API to list or manage sessions programmatically.
- If session storage is corrupted or cleared, the conversation loses context (but message history in Convex is unaffected).

## Configuration

Agent runtime config for Claude Code:

```json
{
  "kind": "claude-code",
  "modelCacheTtlSeconds": 300,
  "claudeCode": {
    "command": "claude",
    "args": [],
    "baseEnv": {},
    "permissionMode": "auto"
  }
}
```

- `command`: binary name or absolute path to the `claude` CLI.
- `args`: additional CLI arguments appended to every invocation.
- `baseEnv`: environment overrides.
- `permissionMode`: default permission mode (`auto`, `acceptEdits`, `bypassPermissions`, `plan`).

No `idleTtlSeconds` because there is no persistent process.

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
- The `--session-id` and `--resume` behavior may change.
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
