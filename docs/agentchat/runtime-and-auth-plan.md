# Agentchat Runtime And Auth Plan

## Purpose

This plan combines two closely related product changes:

- finish the move to a backend-owned runtime model
- keep local access user-based through a real Convex-backed local auth system

These should be planned together because they meet at the same boundary:

- the backend owns execution
- Convex owns user identity and durable state
- clients are observers and input surfaces, not execution owners

## Why These Changes Belong Together

The runtime model is only truly correct when it is scoped to real users.

Agentchat already supports:

- multiple conversations running at once
- multiple agents running at once
- multiple clients observing the same run
- zero-client runtime continuation

But the long-term product should not depend on a shared default user to test or operate those behaviors. Even the insecure local/LAN path should still be user-based in Convex.

That means:

- runtime bindings must stay user-scoped
- subscriptions must stay user-scoped
- backend tokens must always resolve to a concrete Convex user
- smoke and integration testing should use real separate users such as `smoke_1` and `smoke_2`

## Current State

### Runtime

The runtime is partway to the target model:

- backend-owned execution is documented and partially implemented
- runs can survive chat switches, agent switches, reconnects, and zero-client periods
- multiple conversations can be active at once
- web and mobile subscribe to active conversations in the background
- per-thread activity state is now derived in Convex from runtime bindings plus `lastViewedAt`, with clients only applying display-specific suppression for the open conversation
- per-agent activity counts are now derived in Convex too, so workspace summaries no longer depend on each client recomputing raw binding state

Remaining gaps are mostly about:

- richer workspace-level activity state and navigation
- cross-client consistency
- making every client behavior match the documented execution model

### Auth

Current auth states are:

- `google`
- `local`

Agentchat no longer treats disabled-auth as a supported product mode. Local seeded users such as `smoke_1` and `smoke_2` are now the normal local testing and operator path.

## Goals

- The backend owns runtime lifecycle after a send is accepted.
- Convex always resolves requests to a real user, even for insecure local/LAN usage.
- Users can switch chats, agents, clients, or leave entirely without affecting active runs.
- Multiple users can use the same instance concurrently without any runtime-state crossover.
- Local smoke and integration testing use seeded real users such as `smoke_1` and `smoke_2`, not a shared default user.
- The auth system becomes provider-oriented so Google, local, and future providers fit the same architecture.

## Non-Goals

- Building enterprise identity features
- Supporting multiple simultaneously enabled sign-in providers in the first UI slice
- Enforcing LAN-only access at the product level
- Adding admin UX beyond what is required to operate local users

## Product Rules This Plan Enforces

- Every accepted client request must resolve to a concrete Convex user.
- A user’s runtime state must never leak into another user’s conversations, bindings, or subscriptions.
- The backend may continue execution without any active clients, but never without a user owner.
- Clients may observe many active runs, but they do not own those runs.
- Local/insecure access is still multi-user access, not shared-user access.

## Target Runtime Model

### Ownership

- Convex owns:
    - access identity
    - workspace user identity
    - conversations
    - messages
    - runs
    - run events
    - runtime bindings
- Backend owns:
    - in-memory live provider runtimes
    - websocket fanout
    - in-flight stream buffering
    - transient reconnect bookkeeping
- Clients own:
    - visible UI state
    - input actions
    - local display-only hints

### Runtime Invariants

- one active run per conversation is acceptable in v1
- many active conversations per user are allowed
- many active agents per user are allowed
- many clients per user are allowed
- many users per instance are allowed
- runs may continue with zero active clients
- reconnecting clients recover from backend memory plus Convex persistence, not by restarting execution

### Client Model

Clients should converge on:

- foreground conversation state
- background active-conversation subscriptions
- workspace-level activity summary
- no runtime ownership assumptions tied to the visible screen

## Target Auth Model

### Provider-Oriented Auth

Auth should move from a simple mode switch to a provider-oriented configuration model.

Target shape:

```json
{
    "auth": {
        "defaultProviderId": "local-main",
        "providers": [
            {
                "id": "google-main",
                "kind": "google",
                "enabled": true
            },
            {
                "id": "local-main",
                "kind": "local",
                "enabled": true,
                "allowSignup": false
            }
        ]
    }
}
```

### Required Rule

There is no no-user product mode.

Local instances use a `local` auth provider, Convex still resolves a real user identity, and testing uses real seeded users.

### Local User Model

First local-auth slice should support:

- username
- display name
- password
- enabled / disabled state
- createdAt / updatedAt
- optional operator-managed seed creation

Required constraints:

- usernames are unique and normalized
- passwords are never stored in plaintext
- disabled users cannot mint new sessions
- every successful login maps to exactly one `users` row

## Testing Model

### Seeded Runtime/Auth Fixtures

Primary local smoke users:

- `smoke_1`
- `smoke_2`

These should become the standard local multi-user test fixtures.

### What They Should Prove

#### Separation

- `smoke_1` cannot see `smoke_2` conversations
- `smoke_1` and `smoke_2` have distinct Convex `users` rows
- backend session tokens resolve to the correct user

#### Runtime

- both users can run the same agent independently
- both users can run different agents independently
- both users can reconnect and recover active runs independently
- one user’s background subscriptions never surface another user’s runtime state

#### Multi-Client

- web and mobile can both observe the same `smoke_1` run concurrently
- `smoke_1` can close both clients and the run still completes
- `smoke_2` remains isolated during all of the above

## Implementation Phases

### Phase 1. Canonical Runtime/Auth Contract

- Update docs and shared types around the rule that all runtime activity is user-owned.
- Define the provider-oriented auth config shape.
- Define the migration path from current `auth.mode` to `auth.providers[]`.

### Phase 2. Convex Local User Provider

- Add a `local` auth provider path in Convex.
- Keep Convex as the source of truth for session issuance and user resolution.
- Map every local login to a concrete `users` row.
- Add operator tooling to seed users such as `smoke_1` and `smoke_2`.

### Phase 3. Server Runtime Identity Tightening

- Remove assumptions that a shared default user can own local runtime activity.
- Ensure backend token validation always resolves to a concrete user.
- Keep websocket subscriptions, runtime bindings, and persistence strictly user-scoped.

### Phase 4. Web And Mobile Local Login

- Add local login UX for web.
- Add local login UX for mobile.
- Keep Google login available where configured.
- Make provider kind drive the client login surface.

### Phase 5. Smoke And Integration Migration

- Add `smoke_2` separation checks.
- Update browser, mobile, runtime, and operator confidence commands to use real local users.

Current implementation note:

- `bun run setup:local-auth-smoke` prepares the active local setup for `local` auth
- `bun run test:manual:local-auth-separation` proves `smoke_1` and `smoke_2` stay isolated in Convex and backend token issuance
- `bun run test:manual:live-runtime-zero-client` proves a run continues with zero active clients and later reconnects without stale active-run replay
- `bun run test:manual:live-runtime-zero-client-recover` proves a client can reconnect after a real zero-client gap and resume the active run before completion
- `bun run test:manual:live-runtime-multi-client` proves one same-user run can stay live across two clients and continue after the initiating client disconnects
- `bun run test:manual:live-runtime-multi-conversation` proves one user can run two conversations concurrently without runtime-state crossover
- `bun run test:manual:live-runtime-multi-agent` proves one user can run two different agents concurrently without runtime-state crossover
- `bun run test:manual:live-runtime-multi-user` proves `smoke_1` and `smoke_2` can run concurrently without runtime-state crossover

### Phase 6. Remove Disabled-Auth As A Primary Path

- Completed.
- Local auth and seeded smoke users now cover the local product and testing path.
- The remaining work is runtime/auth hardening, not compatibility cleanup.

## Immediate Follow-Up Work

1. Add workspace-level active-run state surfaces for both clients.
    - Completed for thread-level visibility: web and mobile now surface per-conversation `Working`, `New reply`, and `Needs attention` state from runtime bindings.
    - Completed for agent-level counts: web and mobile now consume Convex-derived per-agent activity summaries instead of tallying raw bindings locally.
2. Make websocket/runtime recovery behavior fully user-centric rather than current-chat-centric.
    - In progress: live smoke now covers a same-user two-client handoff after `run.started`.
3. Keep improving higher-level workspace activity/navigation above individual conversation lists.
4. Move smoke coverage from shared default-user assumptions to `smoke_1` and `smoke_2`.

## Success Criteria

- Agentchat runtime behavior is correctly described as backend-owned and user-owned.
- Local insecure instances still operate with real users in Convex.
- `smoke_1` and `smoke_2` become the standard multi-user smoke fixtures.
- Web and mobile behave like equivalent observers of the same backend-owned runtime.
- Disabled-auth is no longer needed for normal local product use or core integration testing.
