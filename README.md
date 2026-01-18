# RouterChat Application

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

See `docs/cloud_dashboard_setup.md` for the Convex/RevenueCat dashboard checklist.

**`.env` (app runtime)**

- `CONVEX_DEPLOYMENT`
- `NEXT_PUBLIC_CONVEX_URL`
- `REVENUECAT_WEB_PURCHASE_URL` - RevenueCat purchase link template (without `app_user_id`)

**Convex environment variables**

- `AUTH_GOOGLE_ID` - Google OAuth client ID
- `AUTH_GOOGLE_SECRET` - Google OAuth client secret
- `JWKS` - JSON Web Key Set for auth
- `JWT_PRIVATE_KEY` - Private key for JWT signing
- `SITE_URL` - Your deployment URL
- `REVENUECAT_WEBHOOK_SECRET` - Authorization header secret for RevenueCat webhooks
- `REVENUECAT_API_KEY` - RevenueCat secret API key for entitlement refresh
- `ENCRYPTION_KEY` - AES-256 key for encrypting sensitive data (API keys)

**Generating the encryption key:**

```bash
# Generate and set in one command
bunx convex env set ENCRYPTION_KEY "$(openssl rand -base64 32)"
```

## Development

```bash
# Run web dev server
cd apps/web && bun dev

# Type check
cd apps/web && bun typecheck

# Build for production
cd apps/web && bun build
```

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
