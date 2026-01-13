# OpenRouter Chat Application

A web application for chatting with AI models through OpenRouter. Users provide their own OpenRouter API key, and all data is stored locally in the browser.

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
- **Local Storage** - API key, settings, and chat history stored in browser
- **IndexedDB Persistence** - Full chat history stored locally
- **Theme Support** - Light, dark, and system theme options

## Tech Stack

| Category  | Technology                     |
| --------- | ------------------------------ |
| Runtime   | Bun 1.x                        |
| Framework | Next.js 16 (App Router)        |
| Language  | TypeScript 5.x                 |
| UI        | Tailwind CSS 4                 |
| State     | React Context + Hooks          |
| Storage   | IndexedDB (idb) + localStorage |
| API       | OpenRouter API                 |
| Linting   | ESLint                         |
| Testing   | Bun Test                       |

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
- **Local storage only**: No backend server; all data stored in browser
- **Monorepo**: Designed for future mobile expansion with shared types
- **Offline support**: Chat history loads from IndexedDB, but API calls require internet

## License

MIT
