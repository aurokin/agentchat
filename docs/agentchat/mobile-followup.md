# Agentchat Mobile Follow-Up

This document tracks mobile work that should happen after the web-first migration steps land.

## Current Strategy

- Web is the primary migration target.
- Mobile should not block the first backend and data model rewrite.
- Mobile work should be queued here as the architecture changes on web and backend.
- Mobile model loading now comes from `apps/server`, and stale OpenRouter/search terminology has been removed from the active mobile code path.
- Mobile message execution is still intentionally behind web. The active chat screen now surfaces that migration state instead of keeping the removed direct-provider transport alive.

## Pending Mobile Work

- Mirror the new web agent bootstrap and selected-agent persistence flow.
- Scope the mobile model catalog to the selected agent's allowed providers and allowlists.
- Replace the current chat and settings flows with the new agent-centric model.
- Add agent selection UI and keep it aligned with the web information architecture.
- Update conversation lists so they are scoped to the selected agent.
- Support empty conversation creation per selected agent.
- Replace current model selection with provider, model, and variant flows driven by the backend.
- Replace the temporary mobile chat-runtime placeholder with the real backend token + WebSocket runtime flow used on web.
- Persist and recover mobile run state from Convex `runs` / `runtime_bindings`.
- Remove image attachment UX and related local handling from the mobile chat flow.
- Remove mobile image quota, cloud image clearing, and attachment cache code to match the web/Convex cleanup.
- Remove any remaining mobile dependency on Convex attachment APIs once the mobile runtime is switched to the new provider architecture.
- Replace any remaining provider-specific client assumptions with backend-driven provider options.
- Add backend token handling and a single authenticated WebSocket connection to mobile.
- Update mobile auth/session handling to work with backend-minted tokens from Convex.
- Revisit local database tables and sync helpers once the Convex schema migration is defined.
- Remove or quarantine legacy storage and sync code that no longer matches the product direction.

## Documentation Rule

Whenever web or backend migration work creates follow-up mobile work, add it here in the same change set.
