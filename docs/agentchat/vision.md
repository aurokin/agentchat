# Agentchat Vision

## Goal

Agentchat is a self-hosted, open source application that connects users to coding agents running on infrastructure owned by the instance operator.

An agent is an operator-defined workspace on the server with a configured provider runtime. Users do not bring their own provider credentials. Users sign in, select an agent, and talk to it through conversations that are stored in Convex.

## Product Shape

- The instance operator configures providers and agents on the server.
- Users select an agent first, then work inside conversations bound to that agent.
- The app supports multiple conversations per agent per user.
- The backend server owns runtime communication with providers such as Codex.
- Convex owns auth, user identity, conversations, messages, and persisted runtime metadata.

## Principles

- Self-hosted first: design for people running Agentchat on their own servers.
- Operator controlled: agents, runtimes, and access are configured by the deployment owner.
- Agent first: the selected agent determines which conversations the user sees. The runtime is an implementation detail of the agent, not a user-facing concept.
- Convex authoritative: conversation history and auth live in Convex.
- Runtime abstraction: the backend API should not hardcode any specific runtime into the product model.
- Multi-runtime: support multiple runtime kinds (Codex, Pi, OpenCode, Claude Code) through a common `KindRuntime` interface.
- Realtime by default: users should see live streaming output over WebSocket.
- Simplicity over knobs: remove product complexity that only existed for the earlier hosted product model.

## Non-Goals For V1

- Billing
- Skills
- User-supplied provider API keys
- Web search toggles
- Attachments
- Conversation branching or forking
- Fine-grained approval controls
- Admin UI for agent management

## Terminology

- Runtime: a backend integration with a coding agent such as Codex, Pi, OpenCode, or Claude Code. Each runtime kind manages its own LLM provider connections internally.
- Agent: an operator-defined workspace with an inline runtime configuration, exposed to users. The agent is the primary unit users interact with.
- Conversation: a user-owned thread bound to exactly one agent.
- Run: one assistant execution started from a user message.
- Runtime binding: persisted metadata that lets the backend reconnect a conversation to its runtime.
