# Mobile Auth, Settings, And Onboarding

## Mobile App Basics

- Uses Expo Router with file-based routing in the `app/` directory.
- Entry point: `index.tsx` imports `expo-router/entry`.
- TypeScript config extends `expo/tsconfig.base`.
- Local EAS dev-client config is in `eas.json`.
- Bundle ID: `com.agentchat.app` (configured in `app.json`).
- Monorepo paths: use `@shared/*` for `packages/shared/src/*` and ensure `metro.config.js` includes `watchFolders` pointing to the workspace root.

## Credential Storage (Tokens)

Sensitive auth credentials are stored using `expo-secure-store`.

### Credential Storage Location

- Storage: Expo SecureStore (encrypted key-value storage)
- Keys: `agentchat-auth-token`, `agentchat-refresh-token`

### Credential Storage Module

Use `lib/storage/credential-storage.ts` for credential operations:

```typescript
import {
    getAuthToken,
    setAuthToken,
    clearAuthToken,
    getRefreshToken,
    setRefreshToken,
    clearRefreshToken,
    clearAllCredentials,
} from "@/lib/storage";

await clearAllCredentials();
```

### Important Notes

- All credential storage functions are async (unlike web's localStorage which is sync).
- Expo SecureStore automatically encrypts data on Android and iOS.
- Always use `clearAllCredentials()` for complete logout.

## Convex Access Modes

The mobile app supports two active access modes plus one compatibility mode:

- `google`: Expo Auth Session with Convex Auth for Google sign-in
- `local`: username/password sign-in through Convex Auth
- `disabled`: deprecated compatibility mode; the mobile app should now direct operators to switch the instance to `local` or `google`

### Required Packages

- `expo-auth-session`
- `@convex-dev/auth`
- `expo-crypto`

### Auth Configuration

- Convex URL is stored in SecureStore under `agentchat-convex-url`.
- Env var: `EXPO_PUBLIC_GOOGLE_CLIENT_ID` (only needed for `google` mode).
- Redirect URI: `agentchat://convex-auth`.
- Provider access is configured by the instance owner on the Agentchat backend.

### Auth Context

Use `useAuthContext()` hook to access authentication state:

```typescript
import { useAuthContext } from "@/lib/convex";

const { user, isAuthenticated, isLoading, signIn, signOut, isConvexAvailable } =
    useAuthContext();
```

### Auth Flow

Google mode:

1. User taps "Sign in with Google" in settings.
2. Expo Auth Session opens Google OAuth.
3. On success, Convex client queries `auth:user` with the access token.
4. Auth context updates user state.
5. The Convex-backed workspace becomes available.

Local mode:

1. User enters a username and password in settings.
2. The mobile app calls Convex Auth with the `password` provider.
3. Convex resolves the login to a concrete `users` row.
4. The Convex-backed workspace becomes available.

Disabled mode:

1. The app detects a disabled auth provider from the Agentchat server bootstrap.
2. The UI treats this as an unsupported compatibility state.
3. The operator should switch the instance to `local` or `google` auth.

### Sign-Out Flow

1. User taps "Sign Out" in settings.
2. Auth context clears user state.
3. Convex client is cleared.
4. Credentials are cleared via `clearAllCredentials()`.
5. The app returns to a signed-out, Convex-only state.

## Convex Availability Check

Convex availability is checked at runtime using the configured URL:

```typescript
import { isConvexConfigured } from "@/lib/convex";

const available = isConvexConfigured();
```

### State Transitions

- Initial launch resolves whether Convex is configured and whether the user is authenticated.
- After successful sign-in, the Convex-backed workspace becomes available.
- After sign-out, the user returns to a signed-out/disconnected state.

### Graceful Degradation

When Convex is unavailable:

- The signed-in workspace should be treated as unavailable.
- UI should explain that the backend workspace cannot currently be reached.
- Do not describe this as a first-class offline or browser-local product mode.

## Settings Page Patterns

The mobile settings page should maintain parity with the web settings page.

### Required Settings Sections

1. Account (Google OAuth sign-in/sign-out or local username/password sign-in)
2. Model Provider (instance-managed provider information)
3. Theme (Light/Dark/System toggle)
4. Storage (Convex workspace status, no local storage UI)
5. About (app version and description)

### Theme Selection

Theme is stored in SecureStore under `agentchat-theme`:

```typescript
import { getTheme, setTheme, type UserTheme } from "@/lib/storage";

type UserTheme = "light" | "dark" | "system";

const theme = await getTheme();

await setTheme("dark");
```

### Storage Section

```typescript
<View style={styles.storageContainer}>
    <Text style={styles.storageInfoText}>
        Chat history, settings, and runtime state live in Convex for this instance.
    </Text>
</View>
```

### Keybindings Section

```typescript
const KEYBINDINGS = [
    { key: "Cmd/Ctrl + ,", description: "Open settings" },
    { key: "Cmd/Ctrl + K", description: "Focus model selector" },
    { key: "Escape", description: "Close modal/dropdown" },
    { key: "Enter", description: "Send message" },
    { key: "Shift + Enter", description: "New line in message" },
];
```

### Settings Screen Layout

- Use `ScrollView` for scrollable content.
- Group related settings in `View` containers with `section` style.
- Use `SafeAreaView` for proper edge handling.
- Section titles use uppercase, 14px, 600 weight, gray color.

## First-Run Onboarding

Onboarding completion is stored in SecureStore under `agentchat-has-completed-onboarding`.

```typescript
import {
    getHasCompletedOnboarding,
    setHasCompletedOnboarding,
} from "@/lib/storage";

const completed = await getHasCompletedOnboarding();

await setHasCompletedOnboarding();
```

### Onboarding State In AppContext

```typescript
import { useAppContext } from "../src/contexts/AppContext";

const { hasCompletedOnboarding, completeOnboarding, isInitialized } = useAppContext();

if (isInitialized && !hasCompletedOnboarding) {
    // Show onboarding screen
}
```

### Onboarding Screen

- File: `app/onboarding.tsx`
- Steps: Welcome, Self-hosted workspace overview, workspace access guidance

### Onboarding Wrapper Component

```typescript
function OnboardingWrapper({ children }: { children: React.ReactNode }): React.ReactElement {
    const { isInitialized, hasCompletedOnboarding, completeOnboarding } = useAppContext();
    const [showOnboarding, setShowOnboarding] = useState(false);

    useEffect(() => {
        if (isInitialized && !hasCompletedOnboarding) {
            setShowOnboarding(true);
        }
    }, [isInitialized, hasCompletedOnboarding]);

    const handleOnboardingComplete = async () => {
        await completeOnboarding();
        setShowOnboarding(false);
    };

    if (showOnboarding) {
        return <OnboardingScreen onComplete={handleOnboardingComplete} />;
    }

    return <>{children}</>;
}
```

## Related Files

- `src/lib/convex/AuthContext.tsx`
- `src/lib/convex/client.ts`
- `src/lib/convex/config.ts`
- `src/lib/convex/index.ts`
- `app/settings.tsx`
- `src/lib/storage/sync-storage.ts`
- `src/contexts/WorkspaceContext.tsx`
