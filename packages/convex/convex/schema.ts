import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

/**
 * Convex Database Schema for Cloud Sync
 *
 * Mirrors the local IndexedDB structure with additional fields
 * for cloud-specific features (user association, storage references).
 */
export default defineSchema({
    ...authTables,
    users: defineTable({
        name: v.optional(v.string()),
        image: v.optional(v.string()),
        email: v.optional(v.string()),
        emailVerificationTime: v.optional(v.number()),
        phone: v.optional(v.string()),
        phoneVerificationTime: v.optional(v.number()),
        isAnonymous: v.optional(v.boolean()),
        initialSync: v.optional(v.boolean()),
        // Encrypted API key storage (AES-256-GCM)
        encryptedApiKey: v.optional(v.string()), // Base64 ciphertext
        apiKeyNonce: v.optional(v.string()), // Base64 IV/nonce
        apiKeyUpdatedAt: v.optional(v.number()), // For sync conflict resolution
        // Cloud usage counters (anti-abuse + cheap usage queries)
        cloudChatCount: v.optional(v.number()),
        cloudMessageCount: v.optional(v.number()),
        cloudSkillCount: v.optional(v.number()),
        cloudAttachmentCount: v.optional(v.number()),
        cloudAttachmentBytes: v.optional(v.number()),
        createdAt: v.optional(v.number()),
        updatedAt: v.optional(v.number()),
    })
        .index("email", ["email"])
        .index("phone", ["phone"]),
    chats: defineTable({
        userId: v.id("users"),
        localId: v.optional(v.string()),
        title: v.string(),
        modelId: v.string(),
        thinking: v.string(),
        searchLevel: v.string(),
        createdAt: v.number(),
        updatedAt: v.number(),
    })
        .index("by_user", ["userId"])
        .index("by_user_updated", ["userId", "updatedAt"])
        .index("by_local_id", ["userId", "localId"]),
    messages: defineTable({
        userId: v.id("users"),
        chatId: v.id("chats"),
        localId: v.optional(v.string()),
        role: v.union(
            v.literal("user"),
            v.literal("assistant"),
            v.literal("system"),
        ),
        content: v.string(),
        contextContent: v.string(),
        thinking: v.optional(v.string()),
        skill: v.optional(v.any()),
        modelId: v.optional(v.string()),
        thinkingLevel: v.optional(v.string()),
        searchLevel: v.optional(v.string()),
        attachmentIds: v.optional(v.array(v.string())),
        createdAt: v.number(),
    })
        .index("by_chat", ["chatId"])
        .index("by_chat_created", ["chatId", "createdAt"])
        .index("by_user", ["userId"])
        .index("by_local_id", ["userId", "localId"]),
    skills: defineTable({
        userId: v.id("users"),
        localId: v.optional(v.string()),
        name: v.string(),
        description: v.string(),
        prompt: v.string(),
        createdAt: v.number(),
    })
        .index("by_user", ["userId"])
        .index("by_local_id", ["userId", "localId"]),
    attachments: defineTable({
        userId: v.id("users"),
        messageId: v.id("messages"),
        localId: v.optional(v.string()),
        type: v.literal("image"),
        mimeType: v.string(),
        storageId: v.id("_storage"),
        width: v.number(),
        height: v.number(),
        size: v.number(),
        purgedAt: v.optional(v.number()),
        createdAt: v.number(),
    })
        .index("by_message", ["messageId"])
        .index("by_user", ["userId"])
        .index("by_user_storage", ["userId", "storageId"])
        .index("by_user_created", ["userId", "createdAt"])
        .index("by_local_id", ["userId", "localId"]),
});
