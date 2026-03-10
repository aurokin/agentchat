# Mobile Auth, Settings, And Onboarding

## Mobile App Basics

- Uses Expo Router with file-based routing in the `app/` directory.
- Entry point: `index.tsx` imports `expo-router/entry`.
- TypeScript config extends `expo/tsconfig.base`.
- EAS config for dev builds is in `eas.json`.
- Bundle ID: `com.agentchat.app` (configured in `app.json`).
- Monorepo paths: use `@shared/*` for `packages/shared/src/*` and ensure `metro.config.js` includes `watchFolders` pointing to the workspace root.

## Credential Storage (API Keys And Tokens)

Sensitive credentials are stored using `expo-secure-store`.

### Credential Storage Location

- Storage: Expo SecureStore (encrypted key-value storage)
- Keys: `routerchat-api-key`, `routerchat-auth-token`, `routerchat-refresh-token`

### Credential Storage Module

Use `lib/storage/credential-storage.ts` for credential operations:

```typescript
import {
    getApiKey,
    setApiKey,
    clearApiKey,
    getAuthToken,
    setAuthToken,
    clearAuthToken,
    getRefreshToken,
    setRefreshToken,
    clearRefreshToken,
    clearAllCredentials,
} from "@/lib/storage";

const apiKey = await getApiKey();
if (apiKey) {
    // Use API key for requests
}

await setApiKey("sk-...");

await clearAllCredentials();
```

### Important Notes

- All credential storage functions are async (unlike web's localStorage which is sync).
- Expo SecureStore automatically encrypts data on Android and iOS.
- Keys are still prefixed with `routerchat-` for backward compatibility with existing installs.
- Always use `clearAllCredentials()` for complete logout, not just `clearApiKey()`.

## Google OAuth Via Convex Auth

The mobile app uses Expo Auth Session with Convex Auth for Google sign-in.

### Required Packages

- `expo-auth-session`
- `@convex-dev/auth`
- `expo-crypto`

### Auth Configuration

- Convex URL is stored in SecureStore under `routerchat-convex-url`.
- Env var: `EXPO_PUBLIC_GOOGLE_CLIENT_ID` (set in `app.config.js` or `app.config.ts`).
- Redirect URI: `agentchat://convex-auth`.
- API key validation works independently of Convex Auth.

### Auth Context

Use `useAuthContext()` hook to access authentication state:

```typescript
import { useAuthContext } from "@/lib/convex";

const { user, isAuthenticated, isLoading, signIn, signOut, isConvexAvailable } =
    useAuthContext();
```

### Auth Flow

1. User taps "Sign in with Google" in settings.
2. Expo Auth Session opens Google OAuth.
3. On success, Convex client queries `auth:user` with the access token.
4. Auth context updates user state.
5. Cloud sync becomes available.

### Sign-Out Flow

1. User taps "Sign Out" in settings.
2. Auth context clears user state.
3. Convex client is cleared.
4. Credentials are cleared via `clearAllCredentials()`.
5. Sync state reverts to `local-only`.

## Sync State Management

The mobile app uses three sync states:

- `local-only`: default, all data stored locally
- `cloud-enabled`: cloud sync is active
- `cloud-disabled`: cloud sync configured but disabled by user

### Sync State Storage

Sync state is stored in SecureStore under `routerchat-sync-state`.

Use `lib/storage/sync-storage.ts` for sync state operations:

```typescript
import { getSyncState, setSyncState, clearSyncState } from "@/lib/storage";

const state = await getSyncState();

await setSyncState("cloud-enabled");

await clearSyncState();
```

### Sync State Context

Use `useAppContext()` to access sync state:

```typescript
import { useAppContext } from "../src/contexts/AppContext";

const { syncState, isConvexAvailable, setSyncState } = useAppContext();

const canUseCloud = isConvexAvailable && syncState === "cloud-enabled";
```

### Convex Availability Check

Convex availability is checked at runtime using the configured URL:

```typescript
import { isConvexConfigured } from "@/lib/convex";

const available = isConvexConfigured();
```

### State Transitions

- Initial launch defaults to `local-only`.
- After Convex configuration, state loads from storage.
- After successful sign-in, user can enable cloud sync.
- After sign-out, state reverts to `local-only`.

### Graceful Degradation

When Convex is unavailable:

- App operates in `local-only` mode.
- All features work without cloud sync.
- UI indicates cloud sync is not available.
- No errors thrown for cloud operations.

## Settings Page Patterns

The mobile settings page should maintain parity with the web settings page.

### Required Settings Sections

1. Account (Google OAuth sign-in/sign-out, user profile info)
2. Sync (cloud sync status with enable/disable toggle)
3. OpenRouter API (API key validation with save/clear functionality)
4. Theme (Light/Dark/System toggle)
5. Storage (cloud storage status and sync information, no local storage UI)
6. Skills (list of user-created skills, read-only in settings)
7. Keybindings (list of keyboard shortcuts)
8. About (app version and description)

### Theme Selection

Theme is stored in SecureStore under `routerchat-theme`:

```typescript
import { getTheme, setTheme, type UserTheme } from "@/lib/storage";

type UserTheme = "light" | "dark" | "system";

const theme = await getTheme();

await setTheme("dark");
```

### Storage Section

```typescript
{syncState === "cloud-enabled" && (
    <View style={styles.storageContainer}>
        <Text style={styles.storageInfoText}>
            Your attachments are stored in the cloud and sync across devices.
        </Text>
        <Text style={styles.storageComingSoon}>
            Cloud storage management coming soon.
        </Text>
    </View>
)}

{syncState !== "cloud-enabled" && (
    <View style={styles.storageContainer}>
        <Text style={styles.storageInfoText}>
            Your chats and attachments are stored only on this device.
        </Text>
        <Text style={styles.storageInfoSubtext}>
            Enable cloud sync to access your data across devices.
        </Text>
    </View>
)}
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

### Skills Display

Show up to 3 skills with a "+X more" indicator:

```typescript
import { useSkillsContext } from "../src/contexts/SkillsContext";

const { skills } = useSkillsContext();

skills.slice(0, 3).map(skill => (
    <SkillCard key={skill.id} skill={skill} />
));

{skills.length > 3 && (
    <Text>+{skills.length - 3} more skills</Text>
)}
```

### API Key Validation

```typescript
import { validateApiKey } from "@shared/core/openrouter";

const handleValidate = async () => {
    setIsValidating(true);
    try {
        const valid = await validateApiKey(apiKey);
        setIsValid(valid);
    } catch {
        setIsValid(false);
    } finally {
        setIsValidating(false);
    }
};
```

### Settings Screen Layout

- Use `ScrollView` for scrollable content.
- Group related settings in `View` containers with `section` style.
- Use `SafeAreaView` for proper edge handling.
- Section titles use uppercase, 14px, 600 weight, gray color.

## First-Run Onboarding

Onboarding completion is stored in SecureStore under `routerchat-has-completed-onboarding`.

The app brand is now `Agentchat`, but persisted SecureStore keys remain on the legacy `routerchat-*` namespace until an explicit migration is added.

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
- Steps: Welcome, Local-first design, Optional cloud sync

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
- `src/lib/quota.ts`
- `src/contexts/SkillsContext.tsx`
