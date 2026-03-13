# Agentchat Roadmap

This roadmap describes the rewrite from the current app into the new Agentchat architecture.

## Phase 0: Direction And Guardrails

Goals:

- Record the product rules
- Record the architecture direction
- Establish the rewrite as the canonical project direction

Deliverables:

- Documentation under `docs/agentchat/`
- Links from top-level docs so humans and agents can find the new direction quickly

## Phase 1: Product Simplification

Goals:

- Remove hosted-product assumptions that do not fit the self-hosted direction
- Keep the UI and data model focused on agent-centric conversations

Planned work:

- Remove remaining provider-specific user-facing flows
- Remove web search toggles
- Reduce settings to provider, model, and variant where needed

## Phase 2: Server Config And Convex Model

Goals:

- Define the top-level server config file
- Define the Convex schema for the new runtime model

Planned work:

- Provider config schema
- Agent config schema
- Auth and allowlist config
- Convex tables for conversations, messages, runs, run events, runtime bindings, and user defaults

## Phase 3: Backend Server Foundation

Goals:

- Introduce the instance-local TypeScript backend
- Add backend auth based on short-lived tokens from Convex identity

Planned work:

- Backend project setup
- WebSocket transport
- Backend token mint and validation flow
- Provider interface definition

## Phase 4: Codex Provider Adapter

Goals:

- Implement the first provider through the generic provider layer
- Support runtime creation, resume, streaming, and interruption

Planned work:

- Codex adapter
- Runtime binding recovery
- Run interruption
- Event normalization from Codex protocol to Agentchat events

## Phase 5: Agent-Centric UX

Goals:

- Make agent selection the primary organizing concept in the app
- Bind conversation views to the selected agent

Planned work:

- Agent switcher near the user profile area
- Agent-filtered conversation lists
- Empty conversation creation per selected agent
- Provider, model, and variant selection before first message
- Lock provider, model, and variant after first message

## Phase 6: Persistence And Reliability

Goals:

- Persist enough runtime data for recovery
- Make reconnect and restart behavior predictable

Planned work:

- Runs and run events in Convex
- Runtime bindings in Convex
- Backend recovery from persisted runtime metadata
- Error handling for disabled providers or changed agent config

## Phase 7: Hardening For Public Self-Hosted Use

Goals:

- Make instance operation understandable and stable
- Prepare for broader external use

Planned work:

- Better deployment runbooks
- Clear operator configuration docs
- Better health and failure reporting
- Rate limits and abuse controls where needed

## Later, Not V1

- OpenCode support through the provider layer
- Pi Coding Agent support through the provider layer
- Pi Agent Core support through the provider layer
- Admin UI for agent and provider management
- Approval controls beyond auto-approve
- Conversation branching and forking

## Success Criteria

- The product is clearly agent-centric rather than model-centric
- Users can only access the instance if the operator allows them
- Conversations persist in Convex and reconnect cleanly
- The backend owns provider runtime communication
- Codex works through a provider abstraction rather than a special-case architecture
