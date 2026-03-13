# Mobile Features And UI Patterns

This document should reflect the current Agentchat product direction, not older hosted or transitional mobile behavior.

## Current Direction

- Mobile is still behind web in some polish and parity areas.
- The target architecture matches web:
  - agent selection first
  - conversations scoped to the selected agent
  - provider, model, and variant options supplied by `apps/server`
  - realtime streaming over a single authenticated WebSocket connection
- Search is no longer part of the product surface.

## UI Guidance

- Keep mobile information architecture aligned with web wherever practical.
- The selected agent should be easy to switch, and the visible conversation list should change with that selection.
- Starting a new conversation should require an agent to already be selected.
- Provider, model, and variant selection should come from backend metadata rather than hardcoded client assumptions.
- When the first message is sent, conversation-level provider settings should follow the same locking rules as web.

## Streaming Guidance

- Do not build new mobile runtime flows around direct-provider streaming from the client.
- The target mobile runtime is the same backend-driven model used on web:
  - backend session token minted from Convex auth
  - one authenticated socket connection per signed-in user
  - normalized conversation/run events from `apps/server`

## Source Of Truth

- For pending mobile parity work, use [docs/agentchat/mobile-followup.md](/home/auro/code/agentchat/docs/agentchat/mobile-followup.md).
- For product rules and architecture, use [docs/agentchat/README.md](/home/auro/code/agentchat/docs/agentchat/README.md).
