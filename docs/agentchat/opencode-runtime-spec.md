# Agentchat OpenCode Runtime Spec

## Purpose

This spec defines how `apps/server` should manage OpenCode as a runtime adapter.

OpenCode is an open-source, provider-agnostic AI coding agent with a full HTTP REST API server mode designed for programmatic integration.

## Upstream Reference

Source: `~/code/opencode-upstream`

Key packages:

- `packages/opencode` — core server and agent engine
- `packages/sdk/js` — generated JavaScript SDK client
- `packages/console/app` — terminal UI

## Why OpenCode

- Dedicated headless server mode with a full REST API (104+ endpoints, OpenAPI spec).
- Provider-agnostic: 28+ AI providers via Vercel AI SDK.
- JavaScript SDK for typed client access.
- SQLite-backed session persistence.
- Designed for remote and programmatic access from the start.

## Runtime Unit

One live OpenCode server process per active conversation (or per agent, with session multiplexing).

Unlike Codex and Pi which use stdin/stdout pipes, OpenCode communicates over HTTP. This changes the transport but not the lifecycle model.

### Process-Per-Conversation vs Process-Per-Agent

Two viable approaches:

**Process per conversation** (recommended for v1):
- Mirrors the Codex and Pi patterns.
- Each conversation gets its own OpenCode server on a dynamic port.
- Clean isolation, simple lifecycle.
- Higher resource overhead if many conversations are active.

**Process per agent** (optimization for later):
- One OpenCode server per agent, multiplexing conversations via sessions.
- Lower resource overhead.
- Requires session management at the Agentchat level.
- OpenCode's session API supports this natively.

## Protocol

OpenCode uses HTTP REST with streaming JSON responses.

### Key Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/session/` | Create a new session |
| `GET` | `/session/` | List sessions |
| `GET` | `/session/:id` | Get session details |
| `POST` | `/session/:id/message` | Send message (streaming response) |
| `POST` | `/session/:id/prompt_async` | Send message (fire and forget) |
| `POST` | `/session/:id/command` | Send command |
| `DELETE` | `/session/:id` | Delete session |
| `GET` | `/session/status` | Session status overview |

### Send Request

```
POST /session/{sessionID}/message
Content-Type: application/json
Authorization: Basic <credentials>

{
  "text": "user message",
  "modelID": "claude-sonnet-4-20250514",
  "providerID": "anthropic"
}
```

### Streaming Response

The response streams as JSON lines:

```json
{"info": {"id": "msg_...", "role": "assistant"}, "parts": []}
{"info": {...}, "parts": [{"type": "text", "content": "partial output"}]}
{"info": {...}, "parts": [{"type": "text", "content": "more output"}, {"tool": "bash", "state": {...}}]}
```

### Differences From Codex and Pi

| Aspect | Codex / Pi | OpenCode |
|--------|-----------|----------|
| Transport | stdin/stdout pipes | HTTP REST |
| Session creation | Implicit on connect | Explicit `POST /session/` |
| Message sending | JSON command to stdin | `POST /session/:id/message` |
| Streaming | JSONL events on stdout | HTTP streaming response body |
| Interruption | Command to stdin | HTTP endpoint or abort |
| Authentication | Process-level | HTTP Basic Auth |

## Lifecycle Model

Same hybrid lifecycle with transport differences:

- Spawn `opencode serve --port <port>` when a conversation first needs a runtime.
- Keep the server warm for the configured idle TTL.
- Shut down the server process after inactivity.
- Recreate and resume when needed. OpenCode stores sessions in SQLite, so history survives process restarts.

## States

Same as Codex: `idle`, `starting`, `active`, `interrupting`, `expired`, `errored`.

Additional state: `starting` includes waiting for the HTTP server to become ready (health check on the assigned port).

## Startup Flow

1. Load the agent config.
2. Confirm the agent is enabled.
3. Read the runtime binding from Convex if one exists.
4. Allocate a port (dynamic or configured).
5. Spawn: `opencode serve --port <port>`.
6. Wait for the server to accept connections (poll health endpoint).
7. Create a session via `POST /session/` with `directory: <rootPath>`.
8. Store session id and port in the runtime binding.

## Send Flow

1. Ensure the conversation runtime exists and the server is healthy.
2. Create a run.
3. Send `POST /session/:sessionId/message` with text and model selection.
4. Read the streaming HTTP response.
5. Map streaming parts to normalized Agentchat events.
6. Persist to Convex.
7. Complete the run when the response stream ends.

## Interrupt Flow

1. Abort the in-flight HTTP request.
2. Send an interrupt command if OpenCode exposes one.
3. Update run status to `interrupted`.
4. Emit normalized interruption events.

## Event Mapping

| OpenCode Response Part | Agentchat Event |
|----------------------|-----------------|
| Text content update | `message.delta` |
| Tool call start | `message.delta` (tool use metadata) |
| Tool call result | `message.delta` (tool result metadata) |
| Response complete | `message.completed` |
| Stream end | `run.completed` |

## Model And Variant Handling

OpenCode uses the Vercel AI SDK and supports 28+ providers. Its model catalog is large and dynamic.

The OpenCode adapter should:

- Fetch available models from the OpenCode server's provider/model endpoints.
- Cache the result for the configured TTL.
- Normalize model metadata into Agentchat's model and variant format.
- Pass `modelID` and `providerID` on each message send.

Variants may map to OpenCode's reasoning or configuration options if available, or remain a model-level concept.

## Session Management

OpenCode manages session persistence in SQLite:

- Sessions are directory-scoped.
- Full message history with multi-part support.
- Session compaction available.
- Sessions survive process restarts.

The Agentchat adapter stores the OpenCode session id in the runtime binding for recovery.

## Port Management

Unlike stdin/stdout runtimes, OpenCode requires port allocation:

- Use dynamic port assignment (port `0`) unless the operator configures a fixed port.
- Store the assigned port in the runtime binding.
- On recovery, if the old port is stale, spawn a new server and create a new session (OpenCode's SQLite will have the history).
- Consider a port range config option for operators who need firewall predictability.

## Authentication

OpenCode server supports HTTP Basic Auth:

- Username: `opencode` (default).
- Password: set via `OPENCODE_SERVER_PASSWORD` environment variable.
- The adapter should configure this in `baseEnv` and include the credentials in all HTTP requests.

## Configuration

Agent runtime config for OpenCode:

```json
{
  "kind": "opencode",
  "idleTtlSeconds": 900,
  "modelCacheTtlSeconds": 300,
  "opencode": {
    "command": "opencode",
    "args": ["serve"],
    "baseEnv": {},
    "port": 0
  }
}
```

- `command`: binary name or absolute path.
- `args`: CLI arguments. Must include `serve`.
- `baseEnv`: environment overrides including `OPENCODE_SERVER_PASSWORD` and provider API keys.
- `port`: fixed port or `0` for dynamic assignment.

The agent's `rootPath` is passed as the session directory.

## Error Handling

Same categories as other runtimes, plus:

- server startup timeout (process started but HTTP not ready)
- port conflict
- HTTP authentication failure
- connection refused (server crashed)
- session not found (stale session id after server restart)

Recoverable failures should fall back to creating a new session.

## Future Considerations

- Process-per-agent with session multiplexing would reduce resource usage for operators with many conversations per agent.
- OpenCode's WebSocket support could enable push-based events instead of HTTP streaming, improving event latency.
- OpenCode's MCP integration could be exposed through Agentchat if MCP support is added later.
- The generated JavaScript SDK could be used directly instead of raw HTTP calls.
