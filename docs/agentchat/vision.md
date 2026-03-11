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
- Operator controlled: providers, agents, and access are configured by the deployment owner.
- Agent first: the selected agent determines which conversations the user sees.
- Convex authoritative: conversation history and auth live in Convex.
- Provider abstraction: the backend API should not hardcode Codex into the product model.
- Codex first: v1 ships with Codex support only, while leaving room for OpenCode later.
- Realtime by default: users should see live streaming output over WebSocket.
- Simplicity over knobs: remove product complexity that only existed for the hosted Routerchat model.

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

- Provider: a backend runtime integration such as Codex or OpenCode.
- Agent: an operator-defined workspace and runtime configuration exposed to users.
- Conversation: a user-owned thread bound to exactly one agent.
- Run: one assistant execution started from a user message.
- Runtime binding: persisted metadata that lets the backend reconnect a conversation to its provider runtime.
