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
- [Run Output Model Proposal](./run-output-model-proposal.md)
- [Testing Plan](./testing-plan.md)
- [Manual QA Checklist](./manual-qa-checklist.md)
- [Mobile Follow-Up](./mobile-followup.md)
- [Mobile Integration Testing](./mobile-integration-testing.md)

## Scope

These docs describe the active Agentchat direction:

- Self-hosted and open source
- Convex-managed access with either allowlisted Google sign-in or disabled-auth default-user mode
- Conversations stored in Convex
- An instance-local backend server
- A provider abstraction that is intentionally being hardened around Codex first
- Agent-centric UX where conversations are bound to the selected agent

If another document elsewhere in the repo conflicts with these docs, treat this directory as the source of truth.
