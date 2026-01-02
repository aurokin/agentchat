# OpenRouter Chat Application

A web application for chatting with AI models through OpenRouter. Users provide their own OpenRouter API key, and all data is stored locally in the browser.

## Current Status

### ✅ Completed Work

#### Project Setup
- [x] Bun workspace initialized with monorepo structure
- [x] Next.js 15 application created in `apps/web`
- [x] TypeScript configured with path aliases
- [x] Tailwind CSS configured

#### Authentication (Clerk)
- [x] Clerk OAuth integration configured
- [x] Sign-in page at `/sign-in`
- [x] Sign-up page at `/sign-up`
- [x] Protected route middleware
- [x] UserButton component in sidebar

#### Local Data Storage
- [x] IndexedDB (via `idb`) for chat sessions and messages
- [x] localStorage helpers for settings (API key, theme)
- [x] ChatContext for managing chat state
- [x] SettingsContext for managing user preferences

#### OpenRouter Integration
- [x] API client for fetching available models
- [x] API client for sending chat messages with streaming
- [x] Thinking mode support (toggle in UI)
- [x] Web search tool support (toggle in UI)

#### UI Components
- [x] Sidebar with chat list, new chat button, settings link
- [x] ChatWindow with message display and input
- [x] MessageList component with user/assistant distinction
- [x] MessageInput with auto-resize and Enter-to-send
- [x] ModelSelector dropdown
- [x] ThinkingToggle component
- [x] SearchToggle component

#### Pages
- [x] Home page (redirects to sign-in or chat)
- [x] Chat page with sidebar and chat window
- [x] Settings page (API key, theme selection)

#### Pages (Auth)
- [x] Sign-in page
- [x] Sign-up page

---

### ⏳ To Do / Future Work

#### Immediate (Before Production)
- [ ] **Add valid Clerk API keys** - Current keys are placeholders
- [ ] **Test with real OpenRouter API** - Verify model fetching and chat completion
- [ ] **Add error handling** - Better error messages for API failures
- [ ] **Loading states** - Add skeletons while loading models/chats

#### Skills (System Prompt Customization)
- [ ] **Skill selector** - Dropdown to select skill at chat creation
- [ ] **Preset skills** - Pre-defined system prompts (e.g., "Helpful Assistant", "Code Expert", "Creative Writer")
- [ ] **Custom skill input** - User can create their own system prompt
- [ ] **Skill persistence** - Save selected skill with chat session
- [ ] **System message injection** - Append skill prompt to API messages

#### Polish & UX
- [ ] **Mobile responsive design** - Improve sidebar for mobile
- [ ] **Keyboard shortcuts** - Ctrl+Enter for new line, etc.
- [ ] **Markdown rendering** - Support code blocks, lists in messages
- [ ] **Copy message** - Button to copy message content
- [ ] **Export chat** - Download conversation as JSON/Markdown
- [ ] **Edit message** - Allow editing user messages

#### Testing
- [ ] **Unit tests** - Vitest for utility functions
- [ ] **E2E tests** - Playwright for critical user flows
- [ ] **Type checking** - Ensure all types are correct

#### Future: Mobile App (Phase 2)
The architecture is designed for future mobile expansion:

- [ ] **Create React Native app** in `apps/mobile` using Expo
- [ ] **Share types** from `packages/shared` between web and mobile
- [ ] **Implement mobile UI** with React Native components
- [ ] **Use AsyncStorage** instead of IndexedDB for mobile
- [ ] **Clerk React Native SDK** for authentication

**Note**: Mobile app will store data independently (no cloud sync as requested)

---

## Project Structure

```
openrouter-chat/
├── apps/
│   └── web/                 # Next.js 15 web application
│       ├── src/
│       │   ├── app/         # Next.js App Router pages
│       │   │   ├── chat/    # Main chat page
│       │   │   ├── settings/# Settings page
│       │   │   ├── sign-in/ # Clerk sign-in
│       │   │   └── sign-up/ # Clerk sign-up
│       │   ├── components/  # React components
│       │   │   └── chat/    # Chat-related components
│       │   ├── contexts/    # React Context providers
│       │   └── lib/         # Utilities and API clients
│       └── package.json
├── packages/
│   └── shared/              # Shared types (for future mobile)
│       ├── src/types/       # TypeScript types
│       └── package.json
├── package.json             # Bun workspace root
└── bun.lockb
```

## Tech Stack

| Category | Technology |
|----------|------------|
| Runtime | Bun 1.x |
| Framework | Next.js 15 (App Router) |
| Language | TypeScript 5.x |
| Authentication | Clerk (OAuth) |
| UI | Tailwind CSS |
| State | React Context + Hooks |
| Storage | IndexedDB (idb) + localStorage |
| API | OpenRouter API |

## Getting Started

### Prerequisites
- Bun 1.x
- Clerk account (for authentication)
- OpenRouter account (for API access)

### Installation

```bash
# Install dependencies
bun install

# Start development server
cd apps/web && bun dev
```

### Configuration

1. Create a Clerk account at https://clerk.com/
2. Create an application and get your API keys
3. Add keys to `apps/web/.env.local`:
   ```env
   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
   CLERK_SECRET_KEY=sk_test_...
   ```
4. Create an OpenRouter account at https://openrouter.ai/
5. Generate an API key from https://openrouter.ai/keys
6. Enter the key in the app's Settings page

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
