# Agentchat

A web application for chatting with AI models through OpenRouter. Users provide their own OpenRouter API key. Agentchat is now being shaped as a self-hosted, Convex-backed app.

## Try It Now

Visit https://www.routerchat.chat to start chatting with Agentchat using your OpenRouter API key.

## Features

- **Chat Interface** - Clean, responsive chat UI with message history
- **Model Selection** - Browse and select from available OpenRouter models
- **Thinking Mode** - Toggle reasoning mode for supported models
- **Web Search** - Enable web search for online-capable models
- **System Skills** - Choose from preset prompts or create custom system messages
- **Markdown Support** - Rich text rendering for code blocks, lists, and formatting
- **Copy Messages** - One-click copy for any message
- **Convex Workspace** - Chats, skills, and encrypted API keys stored in Convex
- **Self-Hosted Direction** - Built for deployments you run and control
- **Optional Analytics** - PostHog instrumentation for product usage events when enabled
- **Theme Support** - Light, dark, and system theme options
- **Android Share Intent** - Share text, links, and images from other Android apps directly into a new Agentchat draft

## About Agentchat

Agentchat is designed to keep you in control of your data and model choices.

- **Self-hosted** - Run Agentchat on infrastructure you control.
- **Convex-backed** - Chats, skills, and encrypted API keys live in Convex.
- **User-empowered** - Choose any model available through OpenRouter and customize your experience.

## Tech Stack

| Category  | Technology                                        |
| --------- | ------------------------------------------------- |
| Runtime   | Bun 1.x                                           |
| Framework | Next.js 16 (App Router)                           |
| Language  | TypeScript 5.x                                    |
| UI        | Tailwind CSS 4                                    |
| State     | React Context + Hooks                             |
| Storage   | Convex + encrypted API key storage                 |
| API       | OpenRouter API                                    |
| Linting   | ESLint                                            |
| Testing   | Bun Test                                          |

## Using the App

1. Open https://www.routerchat.chat
2. Add your OpenRouter API key in Settings
3. Start a new chat and choose a model

## Getting Started

For local development and self-hosting.

### Prerequisites

- Bun 1.x
- OpenRouter account (for API access)

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

1. Create an application and get your API keys
2. Create an OpenRouter account at https://openrouter.ai/
3. Generate an API key from https://openrouter.ai/keys
4. Enter the key in the app's Settings page

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
- `NEXT_PUBLIC_ANALYTICS_ENABLED` - Optional web analytics flag. Set to `true` to enable PostHog client events.
- `NEXT_PUBLIC_ANALYTICS_ENV` - Optional PostHog environment tag when sharing one PostHog project across environments. Recommended values: `dev` (local), `preview` (staging), `prod` (production). When unset, Agentchat infers from hostname and runtime.
- `NEXT_PUBLIC_POSTHOG_KEY` - PostHog project API key (required when `NEXT_PUBLIC_ANALYTICS_ENABLED=true`).
- `NEXT_PUBLIC_POSTHOG_HOST` - Optional PostHog host URL (defaults to `https://us.i.posthog.com`).
- `CANONICAL_HOST` - Optional canonical host redirect enforced by web middleware in deployed environments. Example: `CANONICAL_HOST=www.routerchat.chat` to redirect apex requests to `www`. For preview consistency, you can set `CANONICAL_HOST=preview.routerchat.chat` (optional).
- `DISABLE_CSP` - Optional debug flag (preview/prod only). Set to `true` to disable only the `Content-Security-Policy` header in middleware; other security headers remain enabled. Avoid enabling this in production.

**Mobile app runtime (`apps/mobile`)**

Set these in EAS build env (see `apps/mobile/eas.json`) or in `apps/mobile/.env` for local runs. A template lives at `apps/mobile/.env.example`.

- `EXPO_PUBLIC_CONVEX_URL` - Convex deployment URL for this build (same as web `NEXT_PUBLIC_CONVEX_URL`, from the Convex dashboard).
- `EXPO_PUBLIC_GOOGLE_CLIENT_ID` - Optional. Only needed for client-side Google OAuth flows (the current Convex-hosted sign-in does not require it).

**Convex CLI (`packages/convex`)**

Local dev only. Configure the Convex CLI target deployment in `packages/convex/.env.local` (a template lives at `packages/convex/.env.example`):

- `CONVEX_DEPLOYMENT` - Deployment name used by `convex dev` / `convex codegen`.
    - `CONVEX_URL` is written by the Convex CLI; you don't need to set it manually.

**Convex backend (set per deployment in Convex)**

These are Convex-managed environment variables (not Railway vars). Set them in the Convex dashboard, or via `bunx convex env set ...`.

- `SITE_URL` - Base URL for this deployment (no trailing slash, typically your Railway domain). Used to validate auth redirects.
- `AUTH_GOOGLE_ID` - Google OAuth client ID (from Google Cloud Console).
- `AUTH_GOOGLE_SECRET` - Google OAuth client secret (from Google Cloud Console).
- `JWKS` - JSON Web Key Set used by Convex auth.
- `JWT_PRIVATE_KEY` - Private key used by Convex auth for JWT signing.
- `ENCRYPTION_KEY` - AES-256 key for encrypting sensitive data (API keys).
Convex also provides some runtime variables that you can read but do not set:

- `CONVEX_SITE_URL` - Convex-provided base URL for this deployment's "site" (used by Convex Auth in `packages/convex/convex/auth.config.ts`).

**Optional Convex limits (anti-abuse knobs)**

These are Convex-managed environment variables used by `packages/convex/convex/lib/limits.ts`. They are optional; defaults apply when unset.

- Content size: `ROUTERCHAT_MAX_CHAT_TITLE_CHARS`, `ROUTERCHAT_MAX_MESSAGE_CONTENT_CHARS`, `ROUTERCHAT_MAX_MESSAGE_CONTEXT_CHARS`, `ROUTERCHAT_MAX_MESSAGE_THINKING_CHARS`, `ROUTERCHAT_MAX_SKILL_NAME_CHARS`, `ROUTERCHAT_MAX_SKILL_DESCRIPTION_CHARS`, `ROUTERCHAT_MAX_SKILL_PROMPT_CHARS`, `ROUTERCHAT_MAX_LOCAL_ID_CHARS`
- Per-object / per-user: `ROUTERCHAT_MAX_ATTACHMENT_BYTES`, `ROUTERCHAT_MAX_CHATS_PER_USER`, `ROUTERCHAT_MAX_ATTACHMENTS_PER_MESSAGE`, `ROUTERCHAT_MAX_SKILLS_PER_USER`, `ROUTERCHAT_MAX_MESSAGES_PER_USER`, `ROUTERCHAT_MAX_USER_TOTAL_ATTACH_BYTES`
- Query: `ROUTERCHAT_MAX_LIST_CHATS`, `ROUTERCHAT_MAX_LIST_MESSAGES`, `ROUTERCHAT_MAX_LIST_SKILLS`, `ROUTERCHAT_MAX_LIST_ATTACHMENTS`
- Pagination: `ROUTERCHAT_MAX_PAGE_CHATS`, `ROUTERCHAT_MAX_PAGE_MESSAGES`, `ROUTERCHAT_MAX_PAGE_SKILLS`

Note: Convex requires environment variable names to be < 40 characters.

**Generating the encryption key:**

```bash
# Generate and set in one command
bunx convex env set ENCRYPTION_KEY "$(openssl rand -base64 32)"
```

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

- **Direct API calls**: OpenRouter API calls are made directly from the client
- **Convex-only runtime**: Chats, skills, and API keys are stored through Convex during the current development phase
- **Storage adapter pattern**: The local adapter remains in the codebase, but runtime paths now use Convex
- **Monorepo**: Designed for future mobile expansion with shared types

## License

MIT
