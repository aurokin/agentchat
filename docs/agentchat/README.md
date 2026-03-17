# Agentchat Architecture And Direction

This directory is the canonical reference for the current Agentchat product and architecture.

It exists for both humans and agents:

- Humans should use it to understand the product direction, architecture, and delivery plan.
- Agents should use it to avoid rebuilding old hosted-product assumptions into the current system.

## Read First

- [Vision](./vision.md)
- [Product Rules](./product-rules.md)
- [Architecture V1](./architecture-v1.md)
- [Roadmap](./roadmap.md)

## Implementation Specs

- [Server Config Spec](./server-config-spec.md)
- [Operator Guide](./operator-guide.md)
- [Convex Spec](./convex-spec.md)
- [Backend API Spec](./backend-api-spec.md)
- [Codex Runtime Spec](./codex-runtime-spec.md)
- [Runtime And Auth Plan](./runtime-and-auth-plan.md)
- [Testing Plan](./testing-plan.md)
- [Manual QA Checklist](./manual-qa-checklist.md)
- [Mobile Follow-Up](./mobile-followup.md)
- [Mobile Integration Testing](./mobile-integration-testing.md)

## Multi-Runtime Specs

- [Provider-Agent Merge Plan](../../plans/provider-agent-merge-plan.md)
- [Pi Runtime Spec](./pi-runtime-spec.md)
- [OpenCode Runtime Spec](./opencode-runtime-spec.md)
- [Claude Code Runtime Spec](./claude-code-runtime-spec.md)

## Scope

These docs describe the active Agentchat direction:

- Self-hosted and open source
- Convex-managed access through provider-oriented Google and local-user auth
- Conversations stored in Convex
- An instance-local backend server
- A runtime abstraction currently focused on Codex, with Pi, OpenCode, and Claude Code planned
- Agent-centric UX where conversations are bound to the selected agent

If another document elsewhere in the repo conflicts with these docs, treat this directory as the source of truth.
