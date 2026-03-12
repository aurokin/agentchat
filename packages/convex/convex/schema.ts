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
        // Cloud usage counters (anti-abuse + cheap usage queries)
        cloudChatCount: v.optional(v.number()),
        cloudMessageCount: v.optional(v.number()),
        createdAt: v.optional(v.number()),
        updatedAt: v.optional(v.number()),
    })
        .index("email", ["email"])
        .index("phone", ["phone"]),
    chats: defineTable({
        userId: v.id("users"),
        localId: v.optional(v.string()),
        agentId: v.string(),
        title: v.string(),
        modelId: v.string(),
        thinking: v.string(),
        createdAt: v.number(),
        updatedAt: v.number(),
    })
        .index("by_user", ["userId"])
        .index("by_user_updated", ["userId", "updatedAt"])
        .index("by_userId_and_agentId_and_updatedAt", [
            "userId",
            "agentId",
            "updatedAt",
        ])
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
        modelId: v.optional(v.string()),
        thinkingLevel: v.optional(v.string()),
        createdAt: v.number(),
    })
        .index("by_chat", ["chatId"])
        .index("by_chat_created", ["chatId", "createdAt"])
        .index("by_user", ["userId"])
        .index("by_local_id", ["userId", "localId"]),
});
