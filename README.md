# Agentchat

A self-hosted chat app for connecting users to the agents you expose from your own server. Agentchat currently uses Convex for auth and conversation history, with a local backend server that talks to provider runtimes.

## Architecture

Agentchat is organized around an agent-centric architecture:

- operator-managed agents defined on the server
- Convex-owned auth and conversation history
- an instance-local backend server that talks to provider runtimes
- Codex as the first provider, behind a provider abstraction

The canonical product and architecture docs live in `docs/agentchat/`:

- `docs/agentchat/README.md`
- `docs/agentchat/vision.md`
- `docs/agentchat/product-rules.md`
- `docs/agentchat/architecture-v1.md`
- `docs/agentchat/roadmap.md`

## Features

- **Agent-Scoped Conversations** - Switch agents and work inside separate conversation spaces for each one
- **Chat Interface** - Clean, responsive chat UI with persistent message history
- **Provider-Driven Model Selection** - Choose from the provider, model, and variant options exposed by your server
- **Live Codex Model Catalog** - Provider model and variant options are fetched from Codex and cached in the backend server
- **Realtime Streaming** - Stream assistant output through the Agentchat backend server
- **Markdown Support** - Rich text rendering for code blocks, lists, and formatting
- **Copy Messages** - One-click copy for any message
- **Convex Workspace** - Auth and conversations stored in Convex
- **Self-Hosted** - Built for infrastructure you run and control
- **Theme Support** - Light, dark, and system theme options
- **Android Share Intent** - Share text and links from other Android apps into a new Agentchat draft

## About Agentchat

Agentchat is designed to keep you in control of users, agents, and runtime infrastructure.

- **Self-hosted** - Run Agentchat on infrastructure you control.
- **Convex-backed** - Auth and conversation history live in Convex.
- **Operator-controlled** - Instance owners configure providers, agents, and access controls.

## Tech Stack

| Category  | Technology                                        |
| --------- | ------------------------------------------------- |
| Runtime   | Bun 1.x                                           |
| Framework | Next.js 16 (App Router)                           |
| Language  | TypeScript 5.x                                    |
| UI        | Tailwind CSS 4                                    |
| State     | React Context + Hooks                             |
| Storage   | Convex workspace storage                          |
| API       | Agentchat backend server + provider runtimes      |
| Linting   | ESLint                                            |
| Testing   | Bun Test                                          |

## Using the App

1. Open your Agentchat instance
2. Sign in with an approved account
3. Select an agent
4. Start a new conversation and choose a provider/model if needed

## Getting Started

For local development and self-hosting.

### Prerequisites

- Bun 1.x
- Convex workspace with Google auth configured
- A locally running provider runtime such as Codex app-server

### Installation

```bash
# Install dependencies
bun install

# Start the backend server
cd apps/server && bun dev

# In another shell, start the web app
cd apps/web && bun dev
```

### Environment Setup

- Local development and self-hosting: `docs/local_environment_setup_checklist.md`

### Configuration

1. Configure Google auth for your Convex workspace
2. Set the same `BACKEND_TOKEN_SECRET` in Convex and `apps/server/.env.local`
3. Set the same `RUNTIME_INGRESS_SECRET` in Convex and `apps/server/.env.local`
4. Point `AGENTCHAT_CONVEX_SITE_URL` in `apps/server/.env.local` at your Convex site URL
5. Create your server config from `apps/server/agentchat.config.example.json`

Helpful references:

- `docs/local_environment_setup_checklist.md` for local web, server, mobile, and Convex setup
- `bun run doctor:server` for a manual readiness check against your current `apps/server/agentchat.config.json`

#### Environment variables

Agentchat uses a small set of local/runtime environment surfaces:

- Web app runtime (`apps/web/.env.local`)
- Mobile app runtime (`apps/mobile/.env`)
- Convex CLI (local dev only, `packages/convex/.env.local`)
- Convex runtime (`bunx convex env set` or `bun run convex:env`)

**Web app runtime (`apps/web`)**

Set these in `apps/web/.env.local` for local use. A template lives at `apps/web/.env.example`.

- `NEXT_PUBLIC_CONVEX_URL` - Convex client URL (`*.convex.cloud`).
- `NEXT_PUBLIC_AGENTCHAT_SERVER_URL` - Base URL for the self-hosted Agentchat backend server used for provider/agent metadata. Example: `http://localhost:8787` in local dev.

**Mobile app runtime (`apps/mobile`)**

Set these in `apps/mobile/.env` for local runs. A template lives at `apps/mobile/.env.example`.

- `EXPO_PUBLIC_CONVEX_URL` - Convex client URL for this build (same as web `NEXT_PUBLIC_CONVEX_URL`).
- `EXPO_PUBLIC_AGENTCHAT_SERVER_URL` - Base URL for the self-hosted Agentchat backend server used for provider/model metadata and mobile runtime access. Example: `http://localhost:8787` in local dev.
- `EXPO_PUBLIC_GOOGLE_CLIENT_ID` - Optional. Only needed if you later add client-side Google OAuth flows.

**Convex CLI (`packages/convex`)**

Local dev only. Configure the Convex CLI target workspace in `packages/convex/.env.local` (a template lives at `packages/convex/.env.example`):

- `CONVEX_DEPLOYMENT` - Convex target used by `convex dev` / `convex codegen`.
    - `CONVEX_URL` is written by the Convex CLI; you don't need to set it manually.

**Convex backend**

These are Convex-managed environment variables. Set them in the Convex dashboard, or via `bun run convex:env`.

- `SITE_URL` - Base URL for the local or self-hosted web app (no trailing slash). Used to validate auth redirects.
- `AUTH_GOOGLE_ID` - Google OAuth client ID (from Google Cloud Console).
- `AUTH_GOOGLE_SECRET` - Google OAuth client secret (from Google Cloud Console).
- `BACKEND_TOKEN_SECRET` - Shared secret used to mint short-lived backend session tokens for `apps/server`.
- `RUNTIME_INGRESS_SECRET` - Shared secret used by `apps/server` to persist run/runtime state into Convex HTTP ingress.
- `JWKS` - JSON Web Key Set used by Convex auth.
- `JWT_PRIVATE_KEY` - Private key used by Convex auth for JWT signing.
Convex also provides some runtime variables that you can read but do not set:

- `CONVEX_SITE_URL` - Convex-provided base URL for the workspace "site" (used by Convex Auth in `packages/convex/convex/auth.config.ts`).

**Agentchat backend server (`apps/server`)**

Set these in `apps/server/.env.local` for local development. A template lives at `apps/server/.env.example`.

- `BACKEND_TOKEN_SECRET` - Must exactly match the Convex value so `apps/server` can verify backend session tokens.
- `AGENTCHAT_CONVEX_SITE_URL` - Convex site URL used by `apps/server` runtime persistence ingress. Example: `https://<deployment>.convex.site`.
- `RUNTIME_INGRESS_SECRET` - Must exactly match the Convex value so `apps/server` can persist runs, run events, and runtime bindings.

**Optional Convex limits (anti-abuse knobs)**

These are Convex-managed environment variables used by `packages/convex/convex/lib/limits.ts`. They are optional; defaults apply when unset.

- Content size: `AGENTCHAT_MAX_CHAT_TITLE_CHARS`, `AGENTCHAT_MAX_MESSAGE_CONTENT_CHARS`, `AGENTCHAT_MAX_MESSAGE_CONTEXT_CHARS`, `AGENTCHAT_MAX_MESSAGE_THINKING_CHARS`, `AGENTCHAT_MAX_LOCAL_ID_CHARS`
- Per-object / per-user: `AGENTCHAT_MAX_CHATS_PER_USER`, `AGENTCHAT_MAX_MESSAGES_PER_USER`
- Query: `AGENTCHAT_MAX_LIST_CHATS`, `AGENTCHAT_MAX_LIST_MESSAGES`
- Pagination: `AGENTCHAT_MAX_PAGE_CHATS`, `AGENTCHAT_MAX_PAGE_MESSAGES`

Note: Convex requires environment variable names to be < 40 characters.

## Development

```bash
# Run web dev server
cd apps/web && bun dev

# Type check, lint, test, and format
cd apps/web && bun health

# Build the web app
cd apps/web && bun run build
```

### Multi-app development (from repo root)

Use these scripts when you want Convex and app dev servers running together:

```bash
# Convex + web
bun run dev:web

# Convex + mobile dev client
bun run dev:mobile

# Convex + web + mobile dev client
bun run dev:all

# Default dev script (same as dev:all)
bun run dev
```

Agent instructions live in `AGENTS.md` and the linked docs under `docs/agents/`.

### Manual Confidence

Use these commands when you want a deliberate Codex confidence pass rather than always-on automation:

```bash
# Validate configured agent/provider paths, defaults, and live Codex model access
bun run doctor:server

# Run the targeted Codex confidence suites
bun run test:manual:codex-confidence
```

## Architecture Notes

- **Backend transport**: `apps/server` exposes authenticated HTTP and WebSocket endpoints using short-lived backend tokens minted by Convex
- **Provider runtime**: `apps/server` owns live provider sessions and currently targets Codex first behind a provider abstraction
- **Convex source of truth**: Auth, conversations, runs, and runtime bindings are persisted in Convex
- **Browser storage**: Web local storage is limited to UI preferences like selected agent, theme, and per-agent defaults
- **Monorepo**: Web and server are the primary implementation surfaces; remaining mobile cleanup is tracked in `docs/agentchat/mobile-followup.md`

## Non-Goals

- No hosted deployment platform assumptions in the active app path
- No billing or analytics
- No attachment/image support right now
- No browser-local or SQLite-backed product data mode

## License

MIT
