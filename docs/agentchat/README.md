# Agentchat Direction

This directory is the canonical reference for the Agentchat rewrite.

It exists for both humans and agents:

- Humans should use it to understand the product direction, architecture, and delivery plan.
- Agents should use it to avoid rebuilding old Routerchat assumptions into the new system.

## Read First

- [Vision](./vision.md)
- [Product Rules](./product-rules.md)
- [Architecture V1](./architecture-v1.md)
- [Roadmap](./roadmap.md)

## Scope

These docs describe the new Agentchat direction:

- Self-hosted and open source
- Google-authenticated, instance-allowlisted access
- Conversations stored in Convex
- A new instance-local backend server
- A provider abstraction with Codex first and OpenCode later
- Agent-centric UX where conversations are bound to the selected agent

If an older document elsewhere in the repo conflicts with these docs, treat this directory as the source of truth for the rewrite.
