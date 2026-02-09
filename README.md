# RouterChat

A web application for chatting with AI models through OpenRouter. Users provide their own OpenRouter API key. Data can be stored locally in the browser or synced to the cloud.

## Try It Now

Visit https://www.routerchat.chat to start chatting with your OpenRouter API key.

## Features

- **Chat Interface** - Clean, responsive chat UI with message history
- **Model Selection** - Browse and select from available OpenRouter models
- **Thinking Mode** - Toggle reasoning mode for supported models
- **Web Search** - Enable web search for online-capable models
- **System Skills** - Choose from preset prompts or create custom system messages
- **Markdown Support** - Rich text rendering for code blocks, lists, and formatting
- **Copy Messages** - One-click copy for any message
- **Local Storage** - API key, settings, and chat history stored in browser (default)
- **Cloud Sync** - Optional sync to Convex for cross-device access (Pro subscription)
- **First-run Tutorial** - Short, skippable setup for sync and API keys
- **IndexedDB Persistence** - Full chat history stored locally
- **Theme Support** - Light, dark, and system theme options

## About RouterChat

RouterChat is designed to keep you in control of your data and model choices.

- **Local-first** - Works offline by default. Data stays on-device and requests go straight to OpenRouter.
- **Optional cloud sync** - Enable sync with a Pro subscription, powered by Convex. API keys are stored in encrypted form.
- **User-empowered** - Choose any model available through OpenRouter and customize your experience.

## Tech Stack

| Category  | Technology                                        |
| --------- | ------------------------------------------------- |
| Runtime   | Bun 1.x                                           |
| Framework | Next.js 16 (App Router)                           |
| Language  | TypeScript 5.x                                    |
| UI        | Tailwind CSS 4                                    |
| State     | React Context + Hooks                             |
| Storage   | IndexedDB + localStorage (local) / Convex (cloud) |
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

### Configuration

1. Create an application and get your API keys
2. Create an OpenRouter account at https://openrouter.ai/
3. Generate an API key from https://openrouter.ai/keys
4. Enter the key in the app's Settings page

### Cloud Sync Hosting

Only required if you are hosting an instance with Cloud Sync enabled.

See:

- `docs/deploy/railway.md` for Railway deployment configuration.
- `docs/cloud_dashboard_setup.md` for the Convex/RevenueCat dashboard checklist.
- `docs/preview_environment_setup_checklist.md` for the end-to-end preview environment setup runbook.
- `docs/prod_environment_setup_checklist.md` for the end-to-end production environment setup runbook.
- `docs/mobile_dev_setup.md` for mobile dev builds.

#### Environment variables

RouterChat can run in local-only mode with no env vars. Cloud Sync and Billing require configuration across:

- Web app runtime (Railway service variables / `apps/web/.env.local`)
- Mobile app runtime (EAS build env / `apps/mobile/.env`)
- Convex CLI (local dev only, `packages/convex/.env.local`)
- Convex deployment runtime (Convex dashboard / `convex env set`)

**Web app runtime (`apps/web`)**

Set these as Railway service variables (preview/production) or in `apps/web/.env.local` for local dev. A template lives at `apps/web/.env.example`.

- `NEXT_PUBLIC_CONVEX_URL` - Convex deployment URL (from the Convex dashboard). When unset, RouterChat runs local-only (no cloud sync).
- `REVENUECAT_WEB_PURCHASE_URL` - RevenueCat Web Billing purchase link template (from the RevenueCat dashboard). RouterChat appends `userId` as a path segment (trailing slash is ok).
- `NEXT_PUBLIC_REVENUECAT_WEB_PURCHASE_URL` - Legacy alias for `REVENUECAT_WEB_PURCHASE_URL`.
- `DISABLE_CSP` - Optional debug flag. Set to `true` to disable CSP headers in middleware.

**Mobile app runtime (`apps/mobile`)**

Set these in EAS build env (see `apps/mobile/eas.json`) or in `apps/mobile/.env` for local runs. A template lives at `apps/mobile/.env.example`.

- `EXPO_PUBLIC_CONVEX_URL` - Convex deployment URL for this build (same as web `NEXT_PUBLIC_CONVEX_URL`, from the Convex dashboard). When unset, mobile runs local-only and cloud features are disabled.
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
- `REVENUECAT_WEBHOOK_SECRET` - Authorization header secret for RevenueCat webhooks (you choose this; configure it in RevenueCat server notifications).
- `REVENUECAT_API_KEY` - RevenueCat v2 secret API key for entitlement refresh (from the RevenueCat dashboard).
- `REVENUECAT_PROJECT_ID` - RevenueCat project ID for API v2 calls (from the RevenueCat dashboard).
- `REVENUECAT_ENTITLEMENT_IDS` - Optional comma-separated entitlement identifiers or IDs to treat as Pro (defaults to `pro`).
- `REVENUECAT_DEBUG` - Optional debug flag for logging RevenueCat responses.

Convex also provides some runtime variables that you can read but do not set:

- `CONVEX_SITE_URL` - Convex-provided base URL for this deployment's "site" (used by Convex Auth in `packages/convex/convex/auth.config.ts`).

**Optional Convex limits (anti-abuse knobs)**

These are Convex-managed environment variables used by `packages/convex/convex/lib/limits.ts`. They are optional; defaults apply when unset.

- Content size: `ROUTERCHAT_MAX_CHAT_TITLE_CHARS`, `ROUTERCHAT_MAX_MESSAGE_CONTENT_CHARS`, `ROUTERCHAT_MAX_MESSAGE_CONTEXT_CHARS`, `ROUTERCHAT_MAX_MESSAGE_THINKING_CHARS`, `ROUTERCHAT_MAX_SKILL_NAME_CHARS`, `ROUTERCHAT_MAX_SKILL_DESCRIPTION_CHARS`, `ROUTERCHAT_MAX_SKILL_PROMPT_CHARS`, `ROUTERCHAT_MAX_LOCAL_ID_CHARS`
- Per-object / per-user: `ROUTERCHAT_MAX_ATTACHMENT_BYTES`, `ROUTERCHAT_MAX_CHATS_PER_USER`, `ROUTERCHAT_MAX_ATTACHMENTS_PER_MESSAGE`, `ROUTERCHAT_MAX_SKILLS_PER_USER`, `ROUTERCHAT_MAX_MESSAGES_PER_USER`, `ROUTERCHAT_MAX_USER_TOTAL_ATTACH_BYTES`
- Query: `ROUTERCHAT_MAX_LIST_CHATS`, `ROUTERCHAT_MAX_LIST_MESSAGES`, `ROUTERCHAT_MAX_LIST_SKILLS`, `ROUTERCHAT_MAX_LIST_ATTACHMENTS`
- Pagination: `ROUTERCHAT_MAX_PAGE_CHATS`, `ROUTERCHAT_MAX_PAGE_MESSAGES`, `ROUTERCHAT_MAX_PAGE_SKILLS`

Note: Convex requires environment variable names to be < 40 characters.

**Billing note**: Billing is handled via RevenueCat Web Billing. Stripe is configured inside RevenueCat; do not set Stripe API keys/webhooks for RouterChat.

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
- **Dual storage paths**: App supports both local-only and cloud sync modes
    - **Local mode** (default): All data in IndexedDB + localStorage, no account required
    - **Cloud mode**: Data synced to Convex, requires authentication and Pro subscription
- **Storage adapter pattern**: Unified interface abstracts local vs cloud storage
- **Monorepo**: Designed for future mobile expansion with shared types
- **Offline support**: Local storage (IndexedDB + localStorage) is a separate database from cloud; users can copy cloud data to local storage for offline access

## License

MIT
