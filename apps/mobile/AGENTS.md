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

## Testing

Run typecheck: `bun run typecheck`

## Related Files

- Schema definition: `src/lib/db/schema.ts`
- Database initialization: `src/lib/db/database.ts`
- CRUD operations: `src/lib/db/operations.ts`
- Exports: `src/lib/db/index.ts`
