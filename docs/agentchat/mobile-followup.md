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
- Mobile settings now surface the selected agent and deployment-managed provider/model/variant defaults instead of the older mixed sync/settings wording.
- Mobile model selection now persists provider-first choices per agent and narrows the model list to the selected provider.
- Mobile composer now exposes provider and variant selection, and conversation sends persist `variantId` through the shared runtime and Convex sync model.
- Mobile share intent is now text-only, matching the current product surface.
- Removed mobile media-storage helpers and the retired local database path no longer shapes the active app model.

## Pending Mobile Work

- Continue refining the mobile chat flow around the new agent-centric model.
- Replace any remaining provider-specific client assumptions with backend-driven provider capability and settings options.
- Keep aligning mobile state helpers with the web runtime model as the rewrite settles.

## Documentation Rule

Whenever web or backend migration work creates follow-up mobile work, add it here in the same change set.
