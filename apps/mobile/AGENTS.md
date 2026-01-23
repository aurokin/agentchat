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
