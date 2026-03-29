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
- `docs/agentchat/operator-guide.md`

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

| Category  | Technology                                   |
| --------- | -------------------------------------------- |
| Runtime   | Bun 1.x                                      |
| Framework | Next.js 16 (App Router)                      |
| Language  | TypeScript 5.x                               |
| UI        | Tailwind CSS 4                               |
| State     | React Context + Hooks                        |
| Storage   | Convex workspace storage                     |
| API       | Agentchat backend server + provider runtimes |
| Linting   | ESLint                                       |
| Testing   | Bun Test                                     |

## Using the App

1. Open your Agentchat instance
2. Sign in with an approved Google account or a seeded local user, depending on the configured auth provider
3. Select an agent
4. Start a new conversation and choose a provider/model if needed

## Getting Started

For local development and self-hosting.

### Prerequisites

- Bun 1.x
- A Convex workspace configured for local/dev use if you need persistence
- A locally running provider runtime such as Codex app-server

### Preferred Local Workflow

From the repo root:

```bash
bun install
bun run bootstrap
bun run status
bun run doctor
bun run worktree:gc -- --dry-run
```

If you want a disposable git worktree for an agent or parallel task:

```bash
bun run worktree:create -- <name>
```

`worktree:create` refuses to run from a dirty source checkout by default, because uncommitted changes are not transferred into a git worktree. Commit or stash first, or use `--allow-dirty` only when you intentionally want the new worktree to start from `HEAD` without local changes.
If you reuse an existing worktree name, Git will attach the worktree to that branch's current commit instead of cloning the source checkout's latest `HEAD`.

Then start the wrapper-owned dev runtime for this checkout:

```bash
bun run dev
```

If a disposable worktree was deleted or drifted outside the wrapper flow, reclaim stale wrapper-managed state with:

```bash
bun run worktree:gc
```

The local wrapper commands are now the authoritative setup path for checkout-local env/config generation.
`bun run dev` is intentionally gated by the wrapper doctor so incomplete Convex or placeholder-secret setups fail fast instead of starting a broken local stack.

Helpful references:

- `docs/local-modes.md` for the wrapper-first local workflow, including worktree lifecycle wrappers and stable host scripts
- `docs/local_environment_setup_checklist.md` for host-level layout, stable host-script setup, migration, and advanced manual setup
- `.github/workflows/manual-wrapper-guardrails.yml` and `.github/workflows/manual-host-guardrails.yml` for manual-only GitHub guardrail runs that exercise the wrapper and stable-host scaffolding without enabling automatic checks yet
- `bun run doctor:server` for a deliberate runtime readiness check against the generated server config
- `bun run setup:test-agent-config` only when you intentionally want the dedicated test fixtures, followed by `bun run bootstrap --adopt`

For the protected host install, use the shell-first stable lifecycle:

```bash
scripts/host/install-stable.sh
scripts/host/doctor-stable.sh
scripts/host/smoke-stable.sh
scripts/host/start-stable.sh
scripts/host/stop-stable.sh
scripts/host/update-stable.sh
scripts/host/rollback-stable.sh
scripts/host/install-stable-user-service.sh --enable-now
```

On the current host, the stable LAN entrypoint is `https://bront.home.arpa:4043` behind local Caddy.
Future public-hostname support is scaffolded in the host config model and docs, but it is intentionally dormant until that cutover is explicitly enabled.

### Configuration

`bun run bootstrap` generates the local runtime files for the current checkout:

- `apps/web/.env.local`
- `apps/server/.env.local`
- `apps/server/agentchat.config.json`

If you intentionally edit those generated files by hand, run `bun run bootstrap --adopt` to fold the current values back into the wrapper-managed manifest. Use `bun run bootstrap --force` only when you want to discard drift and regenerate from the manifest.

Host-level wrapper defaults live under `~/.config/agentchat/config.json`. That file now also supports dormant stable URL metadata:

- `stable.lanUrl`
- `stable.publicUrl`
- `stable.secondaryUrls`

Those fields are planning metadata only right now. They do not change live routing, Convex `SITE_URL`, or reverse-proxy behavior until the public-hostname cutover is intentionally turned on.

#### Environment variables

Agentchat still uses the same env surfaces, but checkout-local web/server files should now be generated by `bun run bootstrap` instead of being your first manual step.

**Web app runtime (`apps/web`)**

Template: `apps/web/.env.example`

- `PORT` - checkout-local web port supplied by the wrapper
- `HOST` - checkout-local web bind host supplied by the wrapper
- `NEXT_PUBLIC_CONVEX_URL` - Convex client URL (`*.convex.cloud`)
- `NEXT_PUBLIC_AGENTCHAT_SERVER_URL` - Base URL for the self-hosted Agentchat backend server
- `NEXT_ALLOWED_DEV_ORIGINS` - Optional comma-separated extra LAN hostnames or IPs to allow in Next dev

**Mobile app runtime (`apps/mobile`)**

Template: `apps/mobile/.env.example`

- `EXPO_PUBLIC_CONVEX_URL` - Convex client URL for this build
- `EXPO_PUBLIC_AGENTCHAT_SERVER_URL` - Base URL for the self-hosted Agentchat backend server
- `EXPO_PUBLIC_GOOGLE_CLIENT_ID` - Optional. Only needed for the current Google sign-in path when auth mode is `google`

**Convex CLI (`packages/convex`)**

Template: `packages/convex/.env.example`

- `CONVEX_DEPLOYMENT` - Convex target used by `convex dev` / `convex codegen`
- `CONVEX_URL` is written by the Convex CLI

**Convex backend**

These are Convex-managed environment variables. Set them in the Convex dashboard, or via `bun run convex:env`.

- `SITE_URL`
- `AGENTCHAT_AUTH_MODE`
- `AUTH_GOOGLE_ID`
- `AUTH_GOOGLE_SECRET`
- `BACKEND_TOKEN_SECRET`
- `RUNTIME_INGRESS_SECRET`
- `JWKS`
- `JWT_PRIVATE_KEY`
- `CONVEX_SITE_URL`

**Agentchat backend server (`apps/server`)**

Template: `apps/server/.env.example`

- `PORT` - checkout-local server port supplied by the wrapper
- `HOST` - checkout-local server bind host supplied by the wrapper
- `XDG_STATE_HOME` - checkout-local state root supplied by the wrapper
- `BACKEND_TOKEN_SECRET` - must match the Convex value
- `AGENTCHAT_CONVEX_SITE_URL` - Convex site URL used by `apps/server`
- `RUNTIME_INGRESS_SECRET` - must match the Convex value

**Optional Convex limits**

- Content size: `AGENTCHAT_MAX_CHAT_TITLE_CHARS`, `AGENTCHAT_MAX_MESSAGE_CONTENT_CHARS`, `AGENTCHAT_MAX_MESSAGE_CONTEXT_CHARS`, `AGENTCHAT_MAX_MESSAGE_REASONING_CHARS`, `AGENTCHAT_MAX_LOCAL_ID_CHARS`
- Per-object / per-user: `AGENTCHAT_MAX_CHATS_PER_USER`, `AGENTCHAT_MAX_MESSAGES_PER_USER`
- Query: `AGENTCHAT_MAX_LIST_CHATS`, `AGENTCHAT_MAX_LIST_MESSAGES`
- Pagination: `AGENTCHAT_MAX_PAGE_CHATS`, `AGENTCHAT_MAX_PAGE_MESSAGES`

Note: Convex requires environment variable names to be < 40 characters.

## Development

Wrapper-first local commands:

```bash
bun run bootstrap
bun run status
bun run doctor
bun run config:print
```

Wrapper-owned dev runtime commands:

```bash
bun run dev
bun run stop
```

Legacy mobile launchers still exist for paths that are still out of scope for the wrapper workflow:

```bash
bun run legacy:dev:mobile
bun run legacy:dev:mobile:expo-go
bun run legacy:dev:all
```

Agent instructions live in `AGENTS.md` and the linked docs under `docs/agents/`.

### Manual Confidence

Use these commands when you want a deliberate Codex confidence pass rather than always-on automation:

```bash
# Validate configured agent/provider paths, defaults, and live Codex model access
bun run doctor:server

# Generate a local config for the dedicated Agentchat test fixtures
bun run setup:test-agent-config

# Run live Convex codegen plus the targeted Codex confidence suites
bun run test:manual:codex-confidence

# Drive a real local websocket turn through Codex + Convex persistence
bun run test:manual:live-runtime-smoke

# Verify interrupted runs retain partial output and persist interruption state
bun run test:manual:live-runtime-interrupt

# Run the full local server runtime confidence stack (requires apps/server to be running)
bun run test:manual:runtime-confidence
```

The current manual confirmation matrix is green on Local Browser, Remote Browser via Luma, iPad, iPhone, and RedMagic Astra.

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
