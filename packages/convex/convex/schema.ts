import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

/**
 * Convex Database Schema for Agentchat
 *
 * Convex is the durable source of truth for auth, conversations,
 * messages, runs, and runtime bindings.
 */
export default defineSchema({
    ...authTables,
    users: defineTable({
        name: v.optional(v.string()),
        image: v.optional(v.string()),
        email: v.optional(v.string()),
        username: v.optional(v.string()),
        authProvider: v.optional(v.string()),
        localAuthEnabled: v.optional(v.boolean()),
        emailVerificationTime: v.optional(v.number()),
        phone: v.optional(v.string()),
        phoneVerificationTime: v.optional(v.number()),
        isAnonymous: v.optional(v.boolean()),
        // Workspace usage counters (anti-abuse + cheap usage queries)
        workspaceChatCount: v.optional(v.number()),
        workspaceMessageCount: v.optional(v.number()),
        createdAt: v.optional(v.number()),
        updatedAt: v.optional(v.number()),
    })
        .index("email", ["email"])
        .index("username", ["username"])
        .index("phone", ["phone"]),
    chats: defineTable({
        userId: v.id("users"),
        localId: v.optional(v.string()),
        agentId: v.string(),
        title: v.string(),
        modelId: v.string(),
        variantId: v.union(v.string(), v.null()),
        settingsLockedAt: v.union(v.number(), v.null()),
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
        kind: v.optional(
            v.union(
                v.literal("user"),
                v.literal("assistant_message"),
                v.literal("assistant_status"),
                v.literal("system"),
            ),
        ),
        content: v.string(),
        contextContent: v.string(),
        status: v.union(
            v.literal("draft"),
            v.literal("streaming"),
            v.literal("completed"),
            v.literal("interrupted"),
            v.literal("errored"),
        ),
        runId: v.union(v.string(), v.null()),
        reasoning: v.optional(v.string()),
        runMessageIndex: v.union(v.number(), v.null()),
        modelId: v.optional(v.string()),
        variantId: v.union(v.string(), v.null()),
        reasoningEffort: v.optional(v.string()),
        createdAt: v.number(),
        updatedAt: v.number(),
        completedAt: v.union(v.number(), v.null()),
    })
        .index("by_chat", ["chatId"])
        .index("by_chat_created", ["chatId", "createdAt"])
        .index("by_user", ["userId"])
        .index("by_local_id", ["userId", "localId"])
        .index("by_runId", ["runId"]),
    runs: defineTable({
        userId: v.id("users"),
        chatId: v.id("chats"),
        externalId: v.string(),
        provider: v.string(),
        status: v.union(
            v.literal("queued"),
            v.literal("starting"),
            v.literal("running"),
            v.literal("completed"),
            v.literal("interrupted"),
            v.literal("errored"),
        ),
        triggerMessageId: v.union(v.id("messages"), v.null()),
        outputMessageId: v.union(v.id("messages"), v.null()),
        providerThreadId: v.union(v.string(), v.null()),
        providerTurnId: v.union(v.string(), v.null()),
        startedAt: v.number(),
        completedAt: v.union(v.number(), v.null()),
        errorMessage: v.union(v.string(), v.null()),
    })
        .index("by_chatId_and_startedAt", ["chatId", "startedAt"])
        .index("by_userId_and_startedAt", ["userId", "startedAt"])
        .index("by_status_and_startedAt", ["status", "startedAt"])
        .index("by_externalId", ["externalId"]),
    run_events: defineTable({
        runId: v.id("runs"),
        chatId: v.id("chats"),
        userId: v.id("users"),
        sequence: v.number(),
        kind: v.union(
            v.literal("run_started"),
            v.literal("message_started"),
            v.literal("message_delta"),
            v.literal("message_completed"),
            v.literal("run_completed"),
            v.literal("run_interrupted"),
            v.literal("run_failed"),
            v.literal("approval_requested"),
            v.literal("approval_resolved"),
            v.literal("user_input_requested"),
            v.literal("user_input_resolved"),
            v.literal("provider_status"),
        ),
        messageId: v.union(v.id("messages"), v.null()),
        textDelta: v.union(v.string(), v.null()),
        errorMessage: v.union(v.string(), v.null()),
        data: v.union(v.string(), v.null()),
        createdAt: v.number(),
    })
        .index("by_runId_and_sequence", ["runId", "sequence"])
        .index("by_chatId_and_createdAt", ["chatId", "createdAt"])
        .index("by_userId_and_createdAt", ["userId", "createdAt"]),
    runtime_bindings: defineTable({
        chatId: v.id("chats"),
        userId: v.id("users"),
        provider: v.string(),
        status: v.union(
            v.literal("idle"),
            v.literal("active"),
            v.literal("expired"),
            v.literal("errored"),
        ),
        providerThreadId: v.union(v.string(), v.null()),
        providerResumeToken: v.union(v.string(), v.null()),
        activeRunId: v.union(v.string(), v.null()),
        lastError: v.union(v.string(), v.null()),
        lastEventAt: v.union(v.number(), v.null()),
        expiresAt: v.union(v.number(), v.null()),
        updatedAt: v.number(),
    })
        .index("by_chatId", ["chatId"])
        .index("by_userId_and_updatedAt", ["userId", "updatedAt"])
        .index("by_provider_and_status", ["provider", "status"]),
});
