function readPositiveIntEnv(name: string, fallback: number): number {
    const raw = process.env[name];
    if (!raw) return fallback;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const LIMITS = {
    // Content size limits
    maxChatTitleChars: readPositiveIntEnv(
        "AGENTCHAT_MAX_CHAT_TITLE_CHARS",
        500,
    ),
    maxMessageContentChars: readPositiveIntEnv(
        "AGENTCHAT_MAX_MESSAGE_CONTENT_CHARS",
        200_000,
    ),
    maxMessageContextChars: readPositiveIntEnv(
        "AGENTCHAT_MAX_MESSAGE_CONTEXT_CHARS",
        200_000,
    ),
    maxMessageThinkingChars: readPositiveIntEnv(
        "AGENTCHAT_MAX_MESSAGE_THINKING_CHARS",
        200_000,
    ),
    maxLocalIdChars: readPositiveIntEnv("AGENTCHAT_MAX_LOCAL_ID_CHARS", 200),

    // Per-object limits (anti-abuse knobs)
    maxAttachmentBytes: readPositiveIntEnv(
        "AGENTCHAT_MAX_ATTACHMENT_BYTES",
        10 * 1024 * 1024, // 10MB
    ),
    maxChatsPerUser: readPositiveIntEnv("AGENTCHAT_MAX_CHATS_PER_USER", 5_000),
    maxAttachmentsPerMessage: readPositiveIntEnv(
        "AGENTCHAT_MAX_ATTACHMENTS_PER_MESSAGE",
        50,
    ),
    maxMessagesPerUser: readPositiveIntEnv(
        "AGENTCHAT_MAX_MESSAGES_PER_USER",
        100_000,
    ),
    maxTotalAttachmentBytesPerUser: readPositiveIntEnv(
        // Convex env var names must be < 40 chars.
        "AGENTCHAT_MAX_USER_TOTAL_ATTACH_BYTES",
        1 * 1024 * 1024 * 1024, // 1GB
    ),

    // Query limits (anti-DoS knobs). Keep >= corresponding maxes above.
    maxListChats: readPositiveIntEnv("AGENTCHAT_MAX_LIST_CHATS", 5_000),
    maxListMessages: readPositiveIntEnv("AGENTCHAT_MAX_LIST_MESSAGES", 20_000),
    maxListAttachments: readPositiveIntEnv(
        "AGENTCHAT_MAX_LIST_ATTACHMENTS",
        50_000,
    ),

    // Pagination limits (anti-DoS knobs). Bounds `paginationOpts.numItems`.
    maxPageChats: readPositiveIntEnv("AGENTCHAT_MAX_PAGE_CHATS", 250),
    maxPageMessages: readPositiveIntEnv("AGENTCHAT_MAX_PAGE_MESSAGES", 200),
} as const;

export function assertMaxLen(
    value: string | undefined,
    maxChars: number,
    fieldName: string,
): void {
    if (value === undefined) return;
    if (value.length > maxChars) {
        throw new Error(`${fieldName} exceeds maximum length`);
    }
}
