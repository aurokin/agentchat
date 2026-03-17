# Agentchat Pi Runtime Spec

## Purpose

This spec defines how `apps/server` should manage Pi as a runtime adapter.

Pi refers to the `@mariozechner/pi-coding-agent` and `@mariozechner/pi-agent-core` packages. Pi is an AI agent toolkit with a built-in coding agent, multi-provider LLM abstraction, and an RPC subprocess mode that maps closely to the existing Codex app-server integration pattern.

## Upstream Reference

Source: `~/code/pi-mono-upstream`

Key packages:

- `@mariozechner/pi-ai` — unified multi-provider LLM API (Anthropic, OpenAI, Google, Mistral, Groq, xAI, and others)
- `@mariozechner/pi-agent-core` — stateful agent runtime with tool execution and event streaming
- `@mariozechner/pi-coding-agent` — interactive terminal coding agent with RPC mode

## Why Pi

- RPC mode over stdin/stdout is nearly identical to the Codex app-server JSON-RPC pattern.
- Pi manages its own provider connections internally, supporting 15+ LLM providers.
- The event vocabulary maps cleanly to Agentchat's normalized event model.
- TypeScript runtime matches the Agentchat server stack.
- Built-in model registry with pricing and capability metadata.

## Runtime Unit

One live Pi RPC process per active conversation.

This mirrors the Codex pattern: conversation isolation, clean interruption, predictable process cleanup.

## Protocol

Pi's RPC mode uses newline-delimited JSON over stdin/stdout.

### Commands (stdin)

```json
{"type": "prompt", "message": "user message", "id": "req-1"}
{"type": "steer", "message": "redirect the agent"}
{"type": "follow_up", "message": "after you finish, also do this"}
{"type": "set_model", "provider": "anthropic", "modelId": "claude-sonnet-4-20250514"}
{"type": "set_thinking_level", "level": "high"}
{"type": "get_state"}
{"type": "get_messages"}
{"type": "abort"}
{"type": "compact", "customInstructions": "summarize focus areas"}
{"type": "bash", "command": "ls -la"}
```

### Responses (stdout, correlated by id)

```json
{"type": "response", "command": "prompt", "success": true, "id": "req-1"}
{"type": "response", "command": "get_state", "success": true, "data": {...}}
```

### Events (stdout, no id)

```json
{"type": "agent_start"}
{"type": "turn_start"}
{"type": "message_start", "message": {...}}
{"type": "message_update", "message": {...}, "assistantMessageEvent": {...}}
{"type": "message_end", "message": {...}}
{"type": "tool_execution_start", "toolCallId": "...", "toolName": "bash", "args": {...}}
{"type": "tool_execution_update", "toolCallId": "...", "partialResult": {...}}
{"type": "tool_execution_end", "toolCallId": "...", "result": {...}, "isError": false}
{"type": "turn_end", "message": {...}, "toolResults": [...]}
{"type": "agent_end", "messages": [...]}
```

### Differences From Codex JSON-RPC

| Aspect | Codex | Pi |
|--------|-------|-----|
| Framing | JSON-RPC with `method` and `id` | JSONL with `type` field |
| Command correlation | `id` on request and response | `id` on request, echoed in response |
| Events | Notifications without `id` | Events without `id` |
| Thread management | Explicit `thread/create`, `thread/resume` | Implicit, session managed internally |
| Turn lifecycle | `turn/start`, `turn/interrupt` | `prompt`, `abort` |
| Model switching | Set at turn start | `set_model` command mid-session |

## Lifecycle Model

Same hybrid lifecycle as Codex:

- Create a Pi RPC process when a conversation first needs one.
- Keep it warm for the configured idle TTL.
- Shut it down after inactivity.
- Recreate when needed. Pi manages its own session persistence via JSONL files, so context survives process restarts if session paths are stable.

## States

Same as Codex: `idle`, `starting`, `active`, `interrupting`, `expired`, `errored`.

## Startup Flow

1. Load the agent config.
2. Confirm the agent is enabled.
3. Read the runtime binding from Convex if one exists.
4. Spawn: `pi --mode rpc --cwd <rootPath>`.
5. If a previous session exists, Pi resumes from its own JSONL session file.
6. Store session metadata in the runtime binding.

## Send Flow

1. Ensure the conversation runtime exists.
2. Create a run.
3. Send `{"type": "prompt", "message": "...", "id": "..."}` to stdin.
4. Wait for `{"type": "response", "command": "prompt", "success": true, "id": "..."}` to confirm acceptance.
5. Stream events from stdout.
6. Map events to normalized Agentchat events.
7. Persist to Convex.
8. Complete the run when `agent_end` is received.

## Interrupt Flow

1. Send `{"type": "abort"}` to stdin.
2. Pi aborts the current agent loop.
3. Update run status to `interrupted`.
4. Emit normalized interruption events.

## Event Mapping

| Pi Event | Agentchat Event |
|----------|-----------------|
| `agent_start` | `run.started` |
| `message_update` | `message.delta` |
| `message_end` | `message.completed` |
| `agent_end` | `run.completed` |
| `tool_execution_start` | `message.delta` (tool use metadata) |
| `tool_execution_end` | `message.delta` (tool result metadata) |

Tool execution events may be mapped to `message.delta` with structured tool metadata, or to dedicated tool events if the Agentchat event model is extended.

## Model And Variant Handling

Pi's model registry contains 100+ pre-configured models with:

- provider and model id
- pricing (input/output/cache per million tokens)
- context window and max output tokens
- capability flags (reasoning, image input)

Variants map to Pi's thinking levels: `off`, `minimal`, `low`, `medium`, `high`, `xhigh`.

The Pi adapter should:

- Fetch available models from Pi's registry (via `get_state` or by embedding `@mariozechner/pi-ai` model metadata).
- Map Agentchat variant ids to Pi thinking levels.
- Send `set_model` and `set_thinking_level` commands when the model or variant changes.

## Session Management

Pi manages its own session persistence:

- Sessions stored as JSONL files with tree structure (supports branching).
- Each entry has `id` and `parentId` for history navigation.
- Sessions support compaction (summarizing old messages to manage context).
- The Agentchat adapter does not need to manage Pi's session state directly.

The runtime binding stores enough metadata to locate the Pi session on restart.

## Extension UI Requests

Pi extensions may request user interaction via `extension_ui_request` events. In v1, the adapter should auto-resolve these or ignore them, consistent with Agentchat's auto-approve model.

## Configuration

Agent runtime config for Pi:

```json
{
  "kind": "pi",
  "idleTtlSeconds": 900,
  "modelCacheTtlSeconds": 300,
  "pi": {
    "command": "pi",
    "args": ["--mode", "rpc"],
    "baseEnv": {}
  }
}
```

- `command`: binary name or absolute path to the Pi executable.
- `args`: CLI arguments. Must include `--mode rpc`.
- `baseEnv`: environment overrides. Provider API keys (e.g., `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`) should be set here or in the server environment.

The agent's `rootPath` is passed to Pi as `--cwd`.

## Error Handling

Same categories as Codex:

- process startup failure
- invalid model selection
- agent disabled
- interrupted run
- protocol error (malformed JSONL)
- provider authentication failure (Pi surfaces these as structured errors)

## Future Considerations

- Pi's extension system could be exposed through Agentchat if extension UI support is added later.
- Pi's `steer` and `follow_up` commands enable mid-run redirection, which could map to future Agentchat features.
- Pi can be embedded in-process via `createAgentSession()` as an alternative to subprocess spawning. This eliminates process overhead but couples the server to Pi's TypeScript dependencies.
