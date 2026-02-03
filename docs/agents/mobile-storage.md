# Mobile Storage And Database

## SQLite Schema

The mobile app uses `expo-sqlite` with `better-sqlite3` for offline-first storage. The schema mirrors the web's IndexedDB schema in `apps/web/src/lib/db.ts`.

### Tables

| Table | Purpose | Indexes |
| --- | --- | --- |
| `chats` | Chat sessions | `idx_chats_updated` (updated_at DESC) |
| `messages` | Chat messages | `idx_messages_session` (session_id), `idx_messages_created` (created_at ASC) |
| `attachments` | Image attachments | `idx_attachments_message` (message_id), `idx_attachments_created` (created_at ASC) |
| `skills` | User-defined skills | None |
| `skill_settings` | Skill preferences | None |
| `sync_state` | Sync state metadata | None |
| `user_settings` | User preferences | None |
| `schema_version` | Migration tracking | None |

### Schema Conventions

- Use snake_case for column names (example: `model_id`, `created_at`).
- Store JSON arrays as TEXT with `JSON.stringify` and `JSON.parse`.
- Store skill objects denormalized in messages (skill_id, skill_name, skill_description, skill_prompt).
- Use `INTEGER` for timestamps (Unix epoch milliseconds).
- Use `FOREIGN KEY ... ON DELETE CASCADE` for message and attachment cleanup.

## Database Location

- File: `routerchat.db` in the app's document directory.
- Access via `getDatabase()` from `lib/db/database.ts`.
- Database initializes automatically on first access.

## Migration Pattern

1. Increment `SCHEMA_VERSION` in `lib/db/schema.ts`.
2. Add migration logic in `migrateDatabase()`.
3. Migrations run automatically on app start based on stored version.
4. Initial schema creation uses `CREATE TABLE IF NOT EXISTS` for idempotency.

## Row Conversion

Use `*ToRow()` and `rowTo*()` functions in `lib/db/schema.ts` for type-safe conversions:

- `chatSessionToRow()` and `rowToChatSession()`
- `messageToRow()` and `rowToMessage()`
- `attachmentToRow()` and `rowToAttachment()`
- `skillToRow()` and `rowToSkill()`

## File Storage (Attachments)

Image attachments are stored as files in the app's document directory using `expo-file-system`.

### File Storage Location

- Directory: `${FileSystem.documentDirectory}attachments/`
- File naming: `{attachmentId}.{mimeTypeExtension}` (example: `abc123.png`)
- Files are stored with their file URIs referenced in SQLite

### Storage Architecture

1. SQLite metadata: attachments table stores file URI, dimensions, size, and metadata
2. File system: actual image blobs stored in `attachments/` directory
3. Pending attachments: temporary base64 data during image selection before save

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

const pending = createPendingAttachment({
    messageId,
    base64Data,
    mimeType: "image/png",
    width: 1024,
    height: 768,
});

const attachment = await savePendingAttachment(pending, messageId);

const dataUri = await getAttachmentDataUri(attachment);

await deleteAttachmentWithFile(attachmentId);

await cleanupAttachmentOrphanedFiles();
```

### File Storage API

Use `lib/storage/file-storage.ts` for low-level file operations:

```typescript
import * as fileStorage from "@/lib/storage";

const uri = await fileStorage.saveFile(base64Data, {
    id: attachmentId,
    mimeType: "image/png",
    width: 1024,
    height: 768,
});

const data = await fileStorage.readFile(uri);

await fileStorage.deleteFile(uri);

const size = await fileStorage.calculateAttachmentsDirSize();

const freedBytes = await fileStorage.cleanupOrphanedFiles(validUris);
```

### Important Notes

- Always use `expo-file-system/legacy` imports for the legacy API.
- The legacy API exports: `documentDirectory`, `cacheDirectory`, `EncodingType`, `getInfoAsync`, `makeDirectoryAsync`, `readAsStringAsync`, `writeAsStringAsync`, `deleteAsync`, `readDirectoryAsync`.
- File URIs are stored in the `data` field of the Attachment type (which now contains file:// URIs).
- When deleting attachments, delete both the database record and the file.

## Storage Adapter

The mobile app uses `SqliteStorageAdapter` to implement the shared `StorageAdapter` interface from `@shared/core/sync`.

- Adapter: `src/lib/sync/sqlite-adapter.ts`
- Database ops: `src/lib/db/operations.ts`
- Schema: `src/lib/db/schema.ts`
- Shared interface: `packages/shared/src/core/sync/index.ts`

### Adapter Pattern

- Wrap synchronous SQLite operations in async methods.
- Use a singleton adapter instance.
- All methods return Promises to match the `StorageAdapter` interface.

## Dependencies

Required packages in `package.json`:

- `expo-sqlite`
- `better-sqlite3`
- `expo-file-system`
- `uuid`

## Related Files

- `src/lib/db/schema.ts`
- `src/lib/db/database.ts`
- `src/lib/db/operations.ts`
- `src/lib/storage/file-storage.ts`
- `src/lib/storage/attachment-storage.ts`
- `src/lib/storage/credential-storage.ts`
- `src/lib/storage/index.ts`
