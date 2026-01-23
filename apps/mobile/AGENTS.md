# Mobile App Database Patterns

## SQLite Schema

The mobile app uses `expo-sqlite` with `better-sqlite3` for offline-first storage. The schema mirrors the web's IndexedDB schema in `apps/web/src/lib/db.ts`.

### Tables

| Table            | Purpose             | Indexes                                                                            |
| ---------------- | ------------------- | ---------------------------------------------------------------------------------- |
| `chats`          | Chat sessions       | `idx_chats_updated` (updated_at DESC)                                              |
| `messages`       | Chat messages       | `idx_messages_session` (session_id), `idx_messages_created` (created_at ASC)       |
| `attachments`    | Image attachments   | `idx_attachments_message` (message_id), `idx_attachments_created` (created_at ASC) |
| `skills`         | User-defined skills | None                                                                               |
| `skill_settings` | Skill preferences   | None                                                                               |
| `sync_state`     | Sync state metadata | None                                                                               |
| `user_settings`  | User preferences    | None                                                                               |
| `schema_version` | Migration tracking  | None                                                                               |

### Schema Conventions

- Use snake_case for column names (e.g., `model_id`, `created_at`)
- Store JSON arrays as TEXT with `JSON.stringify`/`JSON.parse`
- Store skill objects denormalized in messages (skill_id, skill_name, skill_description, skill_prompt)
- Use `INTEGER` for timestamps (Unix epoch milliseconds)
- Use `FOREIGN KEY ... ON DELETE CASCADE` for message/attachment cleanup

## File Storage (Attachments)

Image attachments are stored as files in the app's document directory using `expo-file-system`.

### File Storage Location

- Directory: `${FileSystem.documentDirectory}attachments/`
- File naming: `{attachmentId}.{mimeTypeExtension}` (e.g., `abc123.png`)
- Files are stored with their file URIs referenced in SQLite

### Storage Architecture

1. **SQLite Metadata**: Attachments table stores file URI, dimensions, size, and metadata
2. **File System**: Actual image blobs stored in `attachments/` directory
3. **Pending Attachments**: Temporary base64 data during image selection before save

### Attachment Storage Module

Use `lib/storage/attachment-storage.ts` for attachment operations:

```typescript
import {
    createPendingAttachment,
    savePendingAttachment,
    saveAttachments,
    getAttachmentDataUri,
    deleteAttachmentWithFile,
    cleanupAttachmentOrphanedFiles,
} from "@/lib/storage";

// Create pending attachment from image picker result
const pending = createPendingAttachment({
    messageId,
    base64Data,
    mimeType: "image/png",
    width: 1024,
    height: 768,
});

// Save to file system and SQLite
const attachment = await savePendingAttachment(pending, messageId);

// Get data URI for display
const dataUri = await getAttachmentDataUri(attachment);

// Delete both file and database record
await deleteAttachmentWithFile(attachmentId);

// Clean up orphaned files not referenced in database
await cleanupAttachmentOrphanedFiles();
```

### File Storage API

Use `lib/storage/file-storage.ts` for low-level file operations:

```typescript
import * as fileStorage from "@/lib/storage";

// Save base64 data to file
const uri = await fileStorage.saveFile(base64Data, {
    id: attachmentId,
    mimeType: "image/png",
    width: 1024,
    height: 768,
});

// Read file back as base64
const data = await fileStorage.readFile(uri);

// Delete file
await fileStorage.deleteFile(uri);

// Calculate storage usage
const size = await fileStorage.calculateAttachmentsDirSize();

// Cleanup orphaned files
const freedBytes = await fileStorage.cleanupOrphanedFiles(validUris);
```

### Important Notes

- Always use `expo-file-system/legacy` imports for the legacy API (documentDirectory, EncodingType, etc.)
- The legacy API exports: `documentDirectory`, `cacheDirectory`, `EncodingType`, `getInfoAsync`, `makeDirectoryAsync`, `readAsStringAsync`, `writeAsStringAsync`, `deleteAsync`, `readDirectoryAsync`
- File URIs are stored in the `data` field of the Attachment type (which now contains file:// URIs)
- When deleting attachments, delete both the database record AND the file

## Database Location

- File: `routerchat.db` in app's document directory
- Access via `getDatabase()` from `lib/db/database.ts`
- Database initializes automatically on first access

## Migration Pattern

1. Increment `SCHEMA_VERSION` in `lib/db/schema.ts`
2. Add migration logic in `migrateDatabase()` function
3. Migrations run automatically on app start based on stored version
4. Initial schema creation uses `CREATE TABLE IF NOT EXISTS` for idempotency

## Row Conversion

Use `*ToRow()` and `rowTo*()` functions in `lib/db/schema.ts` for type-safe conversions:

- `chatSessionToRow()` / `rowToChatSession()`
- `messageToRow()` / `rowToMessage()`
- `attachmentToRow()` / `rowToAttachment()`
- `skillToRow()` / `rowToSkill()`

## Shared Types

Import from `@shared/core/*`:

- Core types: `@shared/core/types` (ChatSession, Message, Attachment, ThinkingLevel, SearchLevel)
- Skills: `@shared/core/skills` (Skill interface)
- Sync: `@shared/core/sync` (StorageAdapter, SkillSettings, SyncMetadata)

## Dependencies

Required packages in `package.json`:

- `expo-sqlite`: SQLite database access
- `better-sqlite3`: SQLite native bindings
- `expo-file-system`: File system access for attachments
- `uuid`: ID generation for attachments

## Testing

Run typecheck: `bun run typecheck`

## Related Files

- Schema definition: `src/lib/db/schema.ts`
- Database initialization: `src/lib/db/database.ts`
- CRUD operations: `src/lib/db/operations.ts`
- File storage: `src/lib/storage/file-storage.ts`
- Attachment storage: `src/lib/storage/attachment-storage.ts`
- Credential storage: `src/lib/storage/credential-storage.ts`
- Storage exports: `src/lib/storage/index.ts`

## Credential Storage (API Keys & Tokens)

Sensitive credentials (API key, auth tokens) are stored using `expo-secure-store` which provides encrypted storage.

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

// Get API key for OpenRouter requests
const apiKey = await getApiKey();
if (apiKey) {
    // Use API key for requests
}

// Save API key
await setApiKey("sk-...");

// Clear all credentials on logout
await clearAllCredentials();
```

### Important Notes

- All credential storage functions are async (unlike web's localStorage which is sync)
- Expo SecureStore automatically encrypts data on Android and iOS
- Keys are prefixed with `routerchat-` to avoid collisions with other apps
- Always use `clearAllCredentials()` for complete logout, not just `clearApiKey()`

## Google OAuth via Convex Auth

The mobile app uses Expo Auth Session with Convex Auth for Google sign-in.

### Required Packages

Add these to `package.json`:

- `expo-auth-session`: For OAuth flow
- `@convex-dev/auth`: For Convex Auth integration
- `expo-crypto`: For crypto operations

### Auth Configuration

Convex URL is stored in SecureStore under `routerchat-convex-url`. Configure it before enabling cloud sync.

### Auth Context

Use `useAuthContext()` hook to access authentication state:

```typescript
import { useAuthContext } from "@/lib/convex";

const { user, isAuthenticated, isLoading, signIn, signOut, isConvexAvailable } =
    useAuthContext();
```

### Auth Flow

1. User clicks "Sign in with Google" in settings
2. Expo Auth Session opens Google OAuth
3. On success, Convex client queries `auth:user` with the access token
4. User is set in AuthContext state
5. Cloud sync becomes available

### Sign-Out Flow

1. User clicks "Sign Out" in settings
2. AuthContext clears user state
3. Convex client is cleared
4. All credentials are cleared via `clearAllCredentials()`
5. Sync state reverts to "local-only"

### Environment Variables

Set in `app.config.js` or `app.config.ts`:

- `EXPO_PUBLIC_GOOGLE_CLIENT_ID`: Google OAuth client ID for mobile

### Redirect URI

The redirect URI uses the app's scheme: `routerchat://convex-auth`

### Offline Mode

Authentication is optional. The app works in local-only mode without authentication. API key validation works independently of Convex Auth.

## Related Files

- Auth context: `src/lib/convex/AuthContext.tsx`
- Convex client: `src/lib/convex/client.ts`
- Config: `src/lib/convex/config.ts`
- Index exports: `src/lib/convex/index.ts`

## Sync State Management

The mobile app uses a sync state pattern similar to the web app, with three states:

- `local-only`: Default state, all data stored locally only
- `cloud-enabled`: Cloud sync is active, data syncs to Convex
- `cloud-disabled`: Cloud sync is configured but disabled by user

### Sync State Storage

Sync state is stored in SecureStore under `routerchat-sync-state` key.

### Sync State Module

Use `lib/storage/sync-storage.ts` for sync state operations:

```typescript
import { getSyncState, setSyncState, clearSyncState } from "@/lib/storage";

// Get current sync state
const state = await getSyncState(); // Returns SyncState | null

// Set sync state
await setSyncState("cloud-enabled");

// Clear sync state
await clearSyncState();
```

### Sync State Context

Use `useAppContext()` to access sync state:

```typescript
import { useAppContext } from "../src/contexts/AppContext";

const { syncState, isConvexAvailable, setSyncState } = useAppContext();

// Check if cloud sync is available
const canUseCloud = isConvexAvailable && syncState === "cloud-enabled";
```

### Convex Availability Check

Convex availability is checked at runtime using the configured URL:

```typescript
import { isConvexConfigured } from "@/lib/convex";

const available = isConvexConfigured();
```

### State Transitions

- **Initial launch**: Defaults to `local-only`
- **After Convex configuration**: Loads persisted state from storage
- **After successful sign-in**: User can enable cloud sync
- **After sign-out**: State reverts to `local-only`

### Graceful Degradation

When Convex is unavailable:

- App operates in `local-only` mode
- All features work without cloud sync
- UI indicates cloud sync is not available
- No errors thrown for cloud operations

## Rendering Attachments in Chat Views

Image attachments stored in FileSystem can be rendered in chat messages using React Native's `Image` component.

### Thumbnail Rendering with Metadata (Recommended)

The recommended pattern shows smaller thumbnails with metadata (dimensions and file size):

```typescript
import { Image } from "react-native";
import { getAttachment } from "../../../src/lib/db";

const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const renderAttachmentThumbnail = (attachment: Attachment) => {
    const aspectRatio =
        attachment.width && attachment.height
            ? attachment.width / attachment.height
            : 1;
    const thumbnailSize = 80;
    const thumbnailWidth = thumbnailSize;
    const thumbnailHeight = thumbnailSize / aspectRatio;

    return (
        <View key={attachment.id} style={styles.attachmentThumbnailContainer}>
            <Image
                source={{ uri: attachment.data }}
                style={[
                    styles.attachmentThumbnail,
                    { width: thumbnailWidth, height: thumbnailHeight },
                ]}
                resizeMode="cover"
            />
            <View style={styles.attachmentMetadata}>
                <Text style={styles.attachmentDimension}>
                    {attachment.width} × {attachment.height}
                </Text>
                <Text style={styles.attachmentSize}>
                    {formatFileSize(attachment.size)}
                </Text>
            </View>
        </View>
    );
};

const renderAttachments = (attachmentIds: string[]) => {
    if (!attachmentIds || attachmentIds.length === 0) return null;

    const attachments = attachmentIds
        .map((id) => getAttachment(id))
        .filter((a): a is Attachment => a !== undefined);

    if (attachments.length === 0) return null;

    return (
        <View style={styles.attachmentsContainer}>
            {attachments.map(renderAttachmentThumbnail)}
        </View>
    );
};
```

### Required Styles for Thumbnails

```typescript
attachmentsContainer: {
    marginTop: 8,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
},
attachmentThumbnailContainer: {
    alignItems: "flex-start",
    gap: 4,
},
attachmentThumbnail: {
    borderRadius: 8,
    backgroundColor: "rgba(0,0,0,0.05)",
},
attachmentMetadata: {
    paddingHorizontal: 4,
    paddingVertical: 2,
},
attachmentDimension: {
    fontSize: 10,
    color: "#666",
},
attachmentSize: {
    fontSize: 10,
    color: "#999",
},
```

### Full-Size Image Rendering (Legacy)

For full-size image display (e.g., in image gallery), use this pattern:

```typescript
import { Image, Dimensions } from "react-native";
import { getAttachment } from "../../../src/lib/db";

const screenWidth = Dimensions.get("window").width;

const renderFullSizeAttachments = (attachmentIds: string[]) => {
    if (!attachmentIds || attachmentIds.length === 0) return null;

    return (
        <View style={styles.attachmentsContainer}>
            {attachmentIds.map((attachmentId) => {
                const attachment = getAttachment(attachmentId);
                if (!attachment) return null;

                const aspectRatio = attachment.width && attachment.height
                    ? attachment.width / attachment.height
                    : 1;
                const maxWidth = screenWidth - 80;
                const maxHeight = 300;
                let imageWidth = maxWidth;
                let imageHeight = maxWidth / aspectRatio;

                if (imageHeight > maxHeight) {
                    imageHeight = maxHeight;
                    imageWidth = maxHeight * aspectRatio;
                }

                return (
                    <Image
                        key={attachment.id}
                        source={{ uri: attachment.data }}
                        style={[
                            styles.attachmentImage,
                            { width: imageWidth, height: imageHeight },
                        ]}
                        resizeMode="contain"
                    />
                );
            })}
        </View>
    );
};
```

### Key Points

- Use synchronous `getAttachment` from `lib/db` operations (not the async version in storage)
- For thumbnails: Use 80px base size with `resizeMode="cover"` for consistent grid display
- For full-size: Calculate aspect ratio to preserve image dimensions with max height of 300px
- Use `resizeMode="contain"` to prevent image distortion for full-size images
- Metadata (dimensions and size) helps users confirm attachments at a glance
- Attachments render below message content and above thinking sections

## Camera and Library Image Picker

The mobile app uses `expo-image-picker` for capturing photos and selecting images from the library.

### Required Package

Add to `package.json`:

```json
"expo-image-picker": "~16.0.3"
```

### Attachment Picker Component

Use `src/components/chat/AttachmentPicker.tsx` for image selection:

```typescript
import { AttachmentPicker } from "../../../src/components/chat/AttachmentPicker";
import type { Attachment } from "@shared/core/types";

// In your component state
const [attachments, setAttachments] = useState<Attachment[]>([]);

// Handle new attachments from picker
const handleAttachmentsSelected = (newAttachments: Attachment[]) => {
    setAttachments((prev) => [...prev, ...newAttachments]);
};

// Remove individual attachment
const handleRemoveAttachment = (attachmentId: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== attachmentId));
};

// In JSX
<AttachmentPicker
    onAttachmentsSelected={handleAttachmentsSelected}
    maxAttachments={5}
    disabled={isLoading}
/>
```

### Image Picker Permissions

The picker requires runtime permissions:

- **Camera**: `ImagePicker.requestCameraPermissionsAsync()`
- **Library**: `ImagePicker.requestMediaLibraryPermissionsAsync()`

The `AttachmentPicker` component handles permission requests automatically.

### Supported Formats

- Media types: `ImagePicker.MediaTypeOptions.Images`
- Multiple selection: Up to `maxAttachments` (default: 5)
- Quality: 0.8 (80% quality)

### Attachment Data Flow

1. User selects images via camera or library
2. `createAttachmentFromAsset()` creates attachment objects with metadata
3. Attachments stored in component state (not yet saved to database)
4. On send, attachments are:
    - Saved to SQLite with temporary messageId
    - Message created with attachmentIds
    - Attachments updated with actual messageId

### Message Input Integration

The `MessageInput` component supports attachments with:

```typescript
<MessageInput
    // ... existing props
    attachments={attachments}
    onAttachmentsChange={handleAttachmentsSelected}
    onRemoveAttachment={handleRemoveAttachment}
/>
```

### Attachment Preview in MessageInput

MessageInput renders attachment thumbnails in a horizontal FlatList with remove buttons.

### Sending Messages with Attachments

```typescript
const handleSend = async () => {
    // Save attachments to database first
    const attachmentIds: string[] = [];
    for (const attachment of attachments) {
        const savedAttachment = { ...attachment, messageId: "" };
        const id = saveAttachment(savedAttachment);
        attachmentIds.push(id);
    }

    // Create message with attachmentIds
    const message = await addMessage({
        sessionId: chatId,
        role: "user",
        content: inputText,
        contextContent: inputText,
        attachmentIds: attachmentIds.length > 0 ? attachmentIds : undefined,
    });

    // Update attachments with actual messageId
    for (const id of attachmentIds) {
        const attachment = getAttachment(id);
        if (attachment) {
            saveAttachment({ ...attachment, messageId: message.id });
        }
    }
};
```

## Related Files

- Attachment picker: `src/components/chat/AttachmentPicker.tsx`
- Message input: `src/components/chat/MessageInput.tsx`
- Chat screen: `app/chat/[id]/index.tsx`
- Database operations: `src/lib/db/operations.ts`
- Shared types: `@shared/core/types`

## Clipboard Image Paste

The mobile app supports pasting images from the clipboard using React Native's `Clipboard` API.

### Required Package

No additional package needed - `Clipboard` is built into `react-native`:

```typescript
import { Clipboard } from "react-native";
```

### Clipboard Paste Pattern

The `AttachmentPicker` component includes a "Paste from Clipboard" option that:

1. Gets clipboard content via `Clipboard.getString()`
2. Validates it's an image URI (starts with `file://`, `http://`, or `data:image`)
3. Creates an attachment from the URI using `createAttachmentFromUri()`
4. Shows appropriate alerts when clipboard is empty or doesn't contain an image

### Supported Clipboard Formats

- **file:// URIs**: Local image files (from file manager apps, etc.)
- **http:// URIs**: Remote image URLs
- **data:image URIs**: Base64-encoded image data

### Fallback Behavior

When clipboard doesn't contain an image, users see helpful alerts:

- **Empty clipboard**: "No Image" alert with instructions
- **Non-image content**: "Not an Image" alert with instructions
- **Error**: Generic error alert suggesting to use file picker instead

### Attachment from URI

For clipboard images, use `createAttachmentFromUri()` which:

- Fetches the image to get size
- For local files (`file://`): Uses `react-native` Image to get dimensions
- For remote/data URIs: Infers MIME type from file extension
- Returns an Attachment object compatible with the SQLite schema

### Important Notes

- Clipboard API only supports `getString()` - images must be stored as URI strings
- iOS typically stores copied images as file:// URIs
- Android may vary depending on the source app
- Always wrap clipboard operations in try-catch for error handling

## Image Resizing and Compression

The mobile app uses `expo-image-manipulator` to resize and compress images before storage.

### Required Package

Add to `package.json`:

```json
"expo-image-manipulator": "~13.0.6"
```

### Image Processing Module

Use `lib/storage/image-processing.ts` for image processing:

```typescript
import { processImage, getMimeTypeFromUri } from "@/lib/storage";

const result = await processImage(uri, "image/jpeg");

// Result contains:
- result.uri: Processed image file URI
- result.width: New width after resizing
- result.height: New height after resizing
- result.size: File size in bytes (compressed)
- result.base64Data: Base64-encoded data for storage
```

### Processing Configuration

- **Max dimension**: 1920px (larger images are scaled down maintaining aspect ratio)
- **Compression quality**: 0.8 (80%)
- **Output format**: JPEG for most images, PNG for transparency

### Attachment Picker Integration

The `AttachmentPicker` component automatically processes images:

```typescript
import { processImage, getMimeTypeFromUri } from "../../lib/storage";

async function createAttachmentFromAsset(
    asset: ImagePicker.ImagePickerAsset,
): Promise<Attachment> {
    const uri = asset.uri;
    const mimeType = asset.mimeType ?? getMimeTypeFromUri(uri);

    const processed = await processImage(uri, mimeType);

    return {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        messageId: "",
        type: "image",
        mimeType: processed.uri.endsWith(".png") ? "image/png" : "image/jpeg",
        data: `data:image/jpeg;base64,${processed.base64Data}`,
        width: processed.width,
        height: processed.height,
        size: processed.size,
        createdAt: Date.now(),
    };
}
```

### Benefits

- Smaller file sizes for faster uploads and less storage usage
- Consistent image dimensions for better memory management
- Reduced bandwidth for cloud sync operations
- Prevents very large images from causing performance issues

### Related Files

- Image processing: `src/lib/storage/image-processing.ts`
- Attachment picker: `src/components/chat/AttachmentPicker.tsx`
- Storage exports: `src/lib/storage/index.ts`

## Settings Page Patterns

The mobile settings page should maintain parity with the web settings page. Key features to include:

### Required Settings Sections

1. **Account** - Google OAuth sign-in/sign-out, user profile info
2. **Sync** - Cloud sync status with enable/disable toggle
3. **OpenRouter API** - API key validation with save/clear functionality
4. **Theme** - Light/Dark/System toggle for color scheme
5. **Storage** - Cloud storage status and sync information (no local storage UI)
6. **Skills** - List of user-created skills (read-only, full CRUD in chat)
7. **Keybindings** - List of built-in keyboard shortcuts
8. **About** - App version and description

### Theme Selection

Theme is stored in SecureStore under `routerchat-theme` key:

```typescript
import { getTheme, setTheme, type UserTheme } from "@/lib/storage";

type UserTheme = "light" | "dark" | "system";

// Get current theme (defaults to "system")
const theme = await getTheme(); // Returns "light" | "dark" | "system"

// Set theme
await setTheme("dark");

// Theme values:
// - "light": Always use light mode
// - "dark": Always use dark mode
// - "system": Follow device system setting
```

### Storage Section

The mobile app shows a simplified Storage section in settings that focuses on cloud sync status rather than local storage management:

```typescript
// When cloud sync is enabled
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

// When in local-only or cloud-disabled mode
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

### Key Points

- Mobile settings do NOT expose local storage management UI
- Cloud storage section shows status messages based on sync state
- No local quota meters or storage stats are displayed in mobile settings
- This keeps the mobile settings focused and simple

### Keybindings Section

Keybindings are displayed as a simple list with keyboard shortcut and description:

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

Skills are read-only in settings (full CRUD is available in chat context). Show up to 3 skills with a "+X more" indicator:

```typescript
import { useSkillsContext } from "../src/contexts/SkillsContext";

const { skills } = useSkillsContext();

// Display first 3 skills
skills.slice(0, 3).map(skill => (
    <SkillCard key={skill.id} skill={skill} />
));

// Show count if more than 3
{skills.length > 3 && (
    <Text>+{skills.length - 3} more skills</Text>
)}
```

### API Key Validation

API keys are validated using the shared core validation function:

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

- Use `ScrollView` for scrollable content
- Group related settings in `View` containers with `section` style
- Use `SafeAreaView` for proper edge handling
- Section titles use uppercase, 14px, 600 weight, gray color

### Related Files

- Settings screen: `app/settings.tsx`
- Theme storage: `src/lib/storage/sync-storage.ts`
- Quota utilities: `src/lib/quota.ts`
- Skills context: `src/contexts/SkillsContext.tsx`

## First-Run Onboarding

The mobile app includes a first-run tutorial that explains cloud vs local sync options.

### Onboarding Storage

Onboarding completion is stored in SecureStore under `routerchat-has-completed-onboarding` key.

```typescript
import {
    getHasCompletedOnboarding,
    setHasCompletedOnboarding,
} from "@/lib/storage";

// Check if onboarding has been completed
const completed = await getHasCompletedOnboarding(); // Returns boolean

// Mark onboarding as complete
await setHasCompletedOnboarding();
```

### Onboarding State in AppContext

The `useAppContext()` hook provides onboarding state:

```typescript
import { useAppContext } from "../src/contexts/AppContext";

const { hasCompletedOnboarding, completeOnboarding, isInitialized } =
    useAppContext();

// Check if app is ready and onboarding hasn't been shown
if (isInitialized && !hasCompletedOnboarding) {
    // Show onboarding screen
}
```

### Onboarding Screen

The onboarding screen (`app/onboarding.tsx`) shows a multi-step tutorial:

- **Step 1**: Welcome to RouterChat with feature highlights
- **Step 2**: Local-first design explanation (offline-first, private, fast)
- **Step 3**: Optional cloud sync explanation (sign-in, cross-device sync)

### Onboarding Wrapper Component

The `_layout.tsx` uses an `OnboardingWrapper` component to conditionally show the onboarding:

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

### Key Points

- Onboarding appears only on first launch (when `hasCompletedOnboarding` is false)
- Uses SecureStore for persistence across app restarts
- Multi-step design with progress indicators
- Explains both local-first and optional cloud sync clearly
- "Back" and "Next" buttons for navigation
- Completes automatically when user taps "Get Started"

## Attachment Gallery Viewer

The mobile app includes a full-screen image gallery viewer that opens when tapping attachment thumbnails. The viewer supports swipe navigation between all attachments in a chat and displays image metadata.

### Gallery Component

Use `src/components/chat/AttachmentGallery.tsx` for the full-screen image viewer:

```typescript
import { AttachmentGallery } from "../../../src/components/chat/AttachmentGallery";
import type { Attachment } from "@shared/core/types";

// In component state
const [galleryVisible, setGalleryVisible] = useState(false);
const [galleryAttachments, setGalleryAttachments] = useState<Attachment[]>([]);
const [galleryInitialIndex, setGalleryInitialIndex] = useState(0);

// Collect all attachments from the chat
const getChatAttachments = (): Attachment[] => {
    const allAttachments: Attachment[] = [];
    const seenIds = new Set<string>();

    chatMessages.forEach((message) => {
        if (message.attachmentIds) {
            message.attachmentIds.forEach((id) => {
                if (!seenIds.has(id)) {
                    seenIds.add(id);
                    const attachment = getAttachment(id);
                    if (attachment) {
                        allAttachments.push(attachment);
                    }
                }
            });
        }
    });

    return allAttachments;
};

// Open gallery when tapping thumbnail
const openGallery = (attachmentId: string, attachments: Attachment[]) => {
    const index = attachments.findIndex((a) => a.id === attachmentId);
    if (index >= 0) {
        setGalleryAttachments(attachments);
        setGalleryInitialIndex(index);
        setGalleryVisible(true);
    }
};

// In JSX
<AttachmentGallery
    visible={galleryVisible}
    attachments={galleryAttachments}
    initialIndex={galleryInitialIndex}
    onClose={() => setGalleryVisible(false)}
/>
```

### Making Thumbnails Tappable

Update `renderAttachmentThumbnail` to include a touch handler:

```typescript
const renderAttachmentThumbnail = (attachment: Attachment) => {
    const aspectRatio = attachment.width && attachment.height
        ? attachment.width / attachment.height
        : 1;
    const thumbnailSize = 80;
    const thumbnailWidth = thumbnailSize;
    const thumbnailHeight = thumbnailSize / aspectRatio;

    return (
        <TouchableOpacity
            key={attachment.id}
            style={styles.attachmentThumbnailContainer}
            onPress={() => openGallery(attachment.id, getChatAttachments())}
            activeOpacity={0.7}
        >
            <Image
                source={{ uri: attachment.data }}
                style={[
                    styles.attachmentThumbnail,
                    { width: thumbnailWidth, height: thumbnailHeight },
                ]}
                resizeMode="cover"
            />
            {/* Metadata display... */}
        </TouchableOpacity>
    );
};
```

### Gallery Features

- **Full-screen display**: Black background with centered image
- **Swipe navigation**: Pan gesture or navigation arrows to swipe between images
- **Metadata display**: Shows dimensions and file size below the image
- **Position indicator**: Shows "1 of N" position in the gallery
- **Dot indicators**: Visual dots showing total images and current position
- **Close button**: Top-right button to dismiss the gallery
- **Touch gestures**: Swipe left/right to navigate, swipe down to dismiss

### Gallery Props

```typescript
interface AttachmentGalleryProps {
    visible: boolean; // Whether gallery is visible
    attachments: Attachment[]; // Array of all attachments to browse
    initialIndex: number; // Starting image index (0-based)
    onClose: () => void; // Callback when gallery closes
}
```

### Important Notes

- Use `TouchableOpacity` with `activeOpacity={0.7}` for better touch feedback on thumbnails
- Collect all chat attachments using `getChatAttachments()` to enable full gallery navigation
- Reset `translateX` animation value when gallery opens to prevent animation issues
- Gallery dimensions use `Dimensions.get("window")` for responsive sizing
- Metadata (dimensions and size) uses the same format as thumbnail display

### Related Files

- Gallery component: `src/components/chat/AttachmentGallery.tsx`
- Chat screen: `app/chat/[id]/index.tsx`
- Database operations: `src/lib/db/operations.ts`
- Shared types: `@shared/core/types`
