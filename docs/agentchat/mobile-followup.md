# Agentchat Mobile Follow-Up

This document tracks mobile work that should happen after the web-first migration steps land.

## Current Strategy

- Web is the primary migration target.
- Mobile should not block the first backend and data model rewrite.
- Mobile work should be queued here as the architecture changes on web and backend.
- Mobile model loading now comes from `apps/server`, and stale OpenRouter/search terminology has been removed from the active mobile code path.
- Mobile now has the same authenticated backend token and shared socket-client foundation as web.
- Mobile chat now sends, interrupts, and streams responses through the shared Agentchat websocket runtime path.
- Mobile now derives conversation runtime state from Convex run summaries, with streamed-message fallback while those summaries are loading.
- Mobile now has an agent context, agent switcher, agent-scoped conversation lists, and agent-scoped model defaults.

## Pending Mobile Work

- Replace the current chat and settings flows with the new agent-centric model.
- Replace current model selection with provider, model, and variant flows driven by the backend.
- Remove image attachment UX and related local handling from the mobile chat flow.
- Remove mobile image quota, cloud image clearing, and attachment cache code to match the web/Convex cleanup.
- Remove any remaining mobile dependency on Convex attachment APIs once the mobile runtime is switched to the new provider architecture.
- Replace any remaining provider-specific client assumptions with backend-driven provider options.
- Update mobile auth/session handling to work with backend-minted tokens from Convex.
- Revisit local database tables and sync helpers once the Convex schema migration is defined.
- Remove or quarantine legacy storage and sync code that no longer matches the product direction.

## Documentation Rule

Whenever web or backend migration work creates follow-up mobile work, add it here in the same change set.
