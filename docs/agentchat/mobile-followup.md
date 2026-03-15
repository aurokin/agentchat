# Agentchat Mobile Follow-Up

This document tracks the remaining mobile work needed to match the current Agentchat architecture.

## Current Strategy

- Web and server are the primary implementation surfaces.
- Mobile should not block backend and data model changes.
- Mobile work should be queued here as the architecture evolves.
- Mobile model loading now comes from `apps/server`, and OpenRouter/search terminology has been removed from the active mobile code path.
- Mobile now has the same authenticated backend token and shared socket-client foundation as web.
- Mobile chat now sends, interrupts, and streams responses through the shared Agentchat websocket runtime path.
- Mobile now derives conversation runtime state from Convex run summaries, with streamed-message fallback while those summaries are loading.
- Mobile now has an agent context, agent switcher, agent-scoped conversation lists, and agent-scoped model defaults.
- Mobile settings now surface the selected agent and deployment-managed provider/model/variant defaults directly.
- Mobile model selection now persists provider-first choices per agent and narrows the model list to the selected provider.
- Mobile composer now exposes provider and variant selection, and conversation sends persist `variantId` through the shared runtime and Convex persistence model.
- Mobile share intent is now text-only, matching the current product surface.
- Removed mobile media-storage helpers and the retired local database path no longer shapes the active app model.

## Pending Mobile Work

- Continue refining the mobile chat flow around the new agent-centric model.
- Replace any remaining provider-specific client assumptions with backend-driven provider capability and settings options.
- Keep aligning mobile state helpers with the web runtime model as the architecture settles.
- Rework the mobile top app bar on home and chat screens; it currently feels awkward and should be revisited as a distinct UI polish pass.
- Validate Android physical-device behavior against the same LAN `dev-client` plus `apps/server` backend flow used for iPhone development builds.
- Keep `bun run doctor:android` green as the operator preflight for Android device parity on Linux.
- Keep Android and iOS on the same backend/session/runtime path whenever possible so platform parity checks exercise the same product behavior.

## Documentation Rule

Whenever web or backend work creates follow-up mobile work, add it here in the same change set.
