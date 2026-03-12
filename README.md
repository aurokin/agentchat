# Agentchat

A self-hosted chat app for connecting users to the agents and model stack you expose from your own deployment. Agentchat currently uses Convex for workspace data and an instance-managed OpenRouter credential for model access.

## Rewrite Direction

The product is currently being refactored into an agent-centric architecture with:

- operator-managed agents defined on the server
- Convex-owned auth and conversation history
- an instance-local backend server that talks to provider runtimes
- Codex as the first provider, behind a provider abstraction

The canonical docs for that rewrite live in `docs/agentchat/`:

- `docs/agentchat/README.md`
- `docs/agentchat/vision.md`
- `docs/agentchat/product-rules.md`
- `docs/agentchat/architecture-v1.md`
- `docs/agentchat/roadmap.md`

## Try It Now

Visit https://www.routerchat.chat to see the current hosted build.

## Features

- **Chat Interface** - Clean, responsive chat UI with message history
- **Model Selection** - Browse and select from available OpenRouter models
- **Thinking Mode** - Toggle reasoning mode for supported models
- **Web Search** - Enable web search for online-capable models
- **Markdown Support** - Rich text rendering for code blocks, lists, and formatting
- **Copy Messages** - One-click copy for any message
- **Convex Workspace** - Chats and attachments stored in Convex
- **Self-Hosted Direction** - Built for deployments you run and control
- **Theme Support** - Light, dark, and system theme options
- **Android Share Intent** - Share text, links, and images from other Android apps directly into a new Agentchat draft

## About Agentchat

Agentchat is designed to keep you in control of your data and model choices.

- **Self-hosted** - Run Agentchat on infrastructure you control.
- **Convex-backed** - Chats and attachments live in Convex.
- **Operator-controlled** - Instance owners configure the model provider and access controls.

## Tech Stack

| Category  | Technology                                        |
| --------- | ------------------------------------------------- |
| Runtime   | Bun 1.x                                           |
| Framework | Next.js 16 (App Router)                           |
| Language  | TypeScript 5.x                                    |
| UI        | Tailwind CSS 4                                    |
| State     | React Context + Hooks                             |
| Storage   | Convex workspace storage                           |
| API       | OpenRouter API                                    |
| Linting   | ESLint                                            |
| Testing   | Bun Test                                          |

## Using the App

1. Open your Agentchat deployment
2. Sign in with an approved account
3. Start a new chat and choose a model

## Getting Started

For local development and self-hosting.

### Prerequisites

- Bun 1.x
- OpenRouter account (for instance-level API access)

### Installation

```bash
# Install dependencies
bun install

# Start development server
cd apps/web && bun dev
```

### Environment Setup Runbooks

- Local development: `docs/local_environment_setup_checklist.md`
- Preview deployment: `docs/preview_environment_setup_checklist.md`
- Production deployment: `docs/prod_environment_setup_checklist.md`

### Configuration

1. Configure Google auth for the Convex deployment
2. Set the same `BACKEND_TOKEN_SECRET` in the Convex deployment environment and `apps/server/.env.local`
3. Set the same `RUNTIME_INGRESS_SECRET` in the Convex deployment environment and `apps/server/.env.local`
4. Point `AGENTCHAT_CONVEX_SITE_URL` in `apps/server/.env.local` at the deployment's Convex site URL

### Hosting

Required for any self-hosted Agentchat deployment.

Primary runbooks:

- `docs/preview_environment_setup_checklist.md` for the end-to-end preview environment setup runbook.
- `docs/prod_environment_setup_checklist.md` for the end-to-end production environment setup runbook.

References:

- `docs/deploy/railway.md` for Railway deployment configuration.
- `docs/cloud_dashboard_setup.md` for the Convex dashboard checklist.
- `docs/mobile_dev_setup.md` for mobile dev builds.

#### Environment variables

Agentchat requires Convex for synced data and authentication:

- Web app runtime (Railway service variables / `apps/web/.env.local`)
- Mobile app runtime (EAS build env / `apps/mobile/.env`)
- Convex CLI (local dev only, `packages/convex/.env.local`)
- Convex deployment runtime (Convex dashboard / `convex env set`)

**Web app runtime (`apps/web`)**

Set these as Railway service variables (preview/production) or in `apps/web/.env.local` for local dev. A template lives at `apps/web/.env.example`.

- `NEXT_PUBLIC_CONVEX_URL` - Convex deployment URL (from the Convex dashboard).
- `NEXT_PUBLIC_AGENTCHAT_SERVER_URL` - Base URL for the self-hosted Agentchat backend server used for provider/agent metadata. Example: `http://localhost:8787` in local dev.
- `CANONICAL_HOST` - Optional canonical host redirect enforced by web middleware in deployed environments. Example: `CANONICAL_HOST=www.routerchat.chat` to redirect apex requests to `www`. For preview consistency, you can set `CANONICAL_HOST=preview.routerchat.chat` (optional).
- `DISABLE_CSP` - Optional debug flag (preview/prod only). Set to `true` to disable only the `Content-Security-Policy` header in middleware; other security headers remain enabled. Avoid enabling this in production.

**Mobile app runtime (`apps/mobile`)**

Set these in EAS build env (see `apps/mobile/eas.json`) or in `apps/mobile/.env` for local runs. A template lives at `apps/mobile/.env.example`.

- `EXPO_PUBLIC_CONVEX_URL` - Convex deployment URL for this build (same as web `NEXT_PUBLIC_CONVEX_URL`, from the Convex dashboard).
- `EXPO_PUBLIC_GOOGLE_CLIENT_ID` - Optional. Only needed if you later add client-side Google OAuth flows.

**Convex CLI (`packages/convex`)**

Local dev only. Configure the Convex CLI target deployment in `packages/convex/.env.local` (a template lives at `packages/convex/.env.example`):

- `CONVEX_DEPLOYMENT` - Deployment name used by `convex dev` / `convex codegen`.
    - `CONVEX_URL` is written by the Convex CLI; you don't need to set it manually.

**Convex backend (set per deployment in Convex)**

These are Convex-managed environment variables (not Railway vars). Set them in the Convex dashboard, or via `bunx convex env set ...`.

- `SITE_URL` - Base URL for this deployment (no trailing slash, typically your Railway domain). Used to validate auth redirects.
- `AUTH_GOOGLE_ID` - Google OAuth client ID (from Google Cloud Console).
- `AUTH_GOOGLE_SECRET` - Google OAuth client secret (from Google Cloud Console).
- `BACKEND_TOKEN_SECRET` - Shared secret used to mint short-lived backend session tokens for `apps/server`.
- `RUNTIME_INGRESS_SECRET` - Shared secret used by `apps/server` to persist run/runtime state into Convex HTTP ingress.
- `JWKS` - JSON Web Key Set used by Convex auth.
- `JWT_PRIVATE_KEY` - Private key used by Convex auth for JWT signing.
Convex also provides some runtime variables that you can read but do not set:

- `CONVEX_SITE_URL` - Convex-provided base URL for this deployment's "site" (used by Convex Auth in `packages/convex/convex/auth.config.ts`).

**Agentchat backend server (`apps/server`)**

Set these in `apps/server/.env.local` for local development. A template lives at `apps/server/.env.example`.

- `BACKEND_TOKEN_SECRET` - Must exactly match the Convex deployment value so `apps/server` can verify backend session tokens.
- `AGENTCHAT_CONVEX_SITE_URL` - Convex site URL for the deployment used by `apps/server` runtime persistence ingress. Example: `https://<deployment>.convex.site`.
- `RUNTIME_INGRESS_SECRET` - Must exactly match the Convex deployment value so `apps/server` can persist runs, run events, and runtime bindings.

**Optional Convex limits (anti-abuse knobs)**

These are Convex-managed environment variables used by `packages/convex/convex/lib/limits.ts`. They are optional; defaults apply when unset.

- Content size: `ROUTERCHAT_MAX_CHAT_TITLE_CHARS`, `ROUTERCHAT_MAX_MESSAGE_CONTENT_CHARS`, `ROUTERCHAT_MAX_MESSAGE_CONTEXT_CHARS`, `ROUTERCHAT_MAX_MESSAGE_THINKING_CHARS`, `ROUTERCHAT_MAX_SKILL_NAME_CHARS`, `ROUTERCHAT_MAX_SKILL_DESCRIPTION_CHARS`, `ROUTERCHAT_MAX_SKILL_PROMPT_CHARS`, `ROUTERCHAT_MAX_LOCAL_ID_CHARS`
- Per-object / per-user: `ROUTERCHAT_MAX_ATTACHMENT_BYTES`, `ROUTERCHAT_MAX_CHATS_PER_USER`, `ROUTERCHAT_MAX_ATTACHMENTS_PER_MESSAGE`, `ROUTERCHAT_MAX_SKILLS_PER_USER`, `ROUTERCHAT_MAX_MESSAGES_PER_USER`, `ROUTERCHAT_MAX_USER_TOTAL_ATTACH_BYTES`
- Query: `ROUTERCHAT_MAX_LIST_CHATS`, `ROUTERCHAT_MAX_LIST_MESSAGES`, `ROUTERCHAT_MAX_LIST_SKILLS`, `ROUTERCHAT_MAX_LIST_ATTACHMENTS`
- Pagination: `ROUTERCHAT_MAX_PAGE_CHATS`, `ROUTERCHAT_MAX_PAGE_MESSAGES`, `ROUTERCHAT_MAX_PAGE_SKILLS`

Note: Convex requires environment variable names to be < 40 characters.

## Development

```bash
# Run web dev server
cd apps/web && bun dev

# Type check, lint, test, and format
cd apps/web && bun health

# Build for production
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

## Architecture Notes

- **Backend transport**: `apps/server` exposes authenticated WebSocket scaffolding using short-lived backend tokens minted by Convex
- **Backend model access**: OpenRouter API calls are still made through a Convex action during the transition
- **Convex-only runtime**: Chats and attachments are stored through Convex during the current development phase
- **Storage adapter pattern**: The local adapter remains in the codebase, but runtime paths now use Convex
- **Monorepo**: Designed for future mobile expansion with shared types

## License

MIT
