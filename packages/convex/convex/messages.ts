import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { mutation, query } from "./_generated/server";
import { isOwner, requireUserMatches } from "./lib/authz";
import { requireCloudSync } from "./lib/subscription";
import { drainBatches } from "./lib/batch";
import { assertMaxLen, LIMITS } from "./lib/limits";
import { clampPaginationOpts } from "./lib/pagination";
import {
    applyCloudUsageDelta,
    ensureCloudUsageCounters,
} from "./lib/cloud_usage";

/**
 * Message Operations
 *
 * CRUD operations for messages within chat sessions.
 */

// Get all messages for a chat, sorted by createdAt ascending
export const listByChat = query({
    args: { chatId: v.id("chats") },
    handler: async (ctx, args) => {
        const authenticatedUserId = await requireCloudSync(ctx);
        const chat = await ctx.db.get(args.chatId);
        if (!isOwner(chat, authenticatedUserId)) {
            return [];
        }

        const messages = await ctx.db
            .query("messages")
            .withIndex("by_chat_created", (q) => q.eq("chatId", args.chatId))
            .order("asc")
            .take(LIMITS.maxListMessages);
        return messages;
    },
});

// Paginated message listing (for infinite scroll UIs + sync)
export const listByChatPaginated = query({
    args: {
        chatId: v.id("chats"),
        paginationOpts: paginationOptsValidator,
    },
    handler: async (ctx, args) => {
        const authenticatedUserId = await requireCloudSync(ctx);
        const chat = await ctx.db.get(args.chatId);
        if (!isOwner(chat, authenticatedUserId)) {
            return {
                page: [],
                isDone: true,
                continueCursor: "",
            };
        }

        const paginationOpts = clampPaginationOpts(
            args.paginationOpts,
            LIMITS.maxPageMessages,
        );

        return await ctx.db
            .query("messages")
            .withIndex("by_chat_created", (q) => q.eq("chatId", args.chatId))
            .order("asc")
            .paginate(paginationOpts);
    },
});

// Get a single message by ID
export const get = query({
    args: { id: v.id("messages") },
    handler: async (ctx, args) => {
        const authenticatedUserId = await requireCloudSync(ctx);
        const message = await ctx.db.get(args.id);
        if (!isOwner(message, authenticatedUserId)) return null;
        return message;
    },
});

// Get message by local ID (for migration)
export const getByLocalId = query({
    args: {
        userId: v.id("users"),
        localId: v.string(),
    },
    handler: async (ctx, args) => {
        const authenticatedUserId = await requireCloudSync(ctx);
        requireUserMatches(authenticatedUserId, args.userId);
        assertMaxLen(args.localId, LIMITS.maxLocalIdChars, "localId");

        return await ctx.db
            .query("messages")
            .withIndex("by_local_id", (q) =>
                q.eq("userId", authenticatedUserId).eq("localId", args.localId),
            )
            .unique();
    },
});

// Create a new message
export const create = mutation({
    args: {
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
        searchLevel: v.optional(v.string()),
        createdAt: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const authenticatedUserId = await requireCloudSync(ctx);
        requireUserMatches(authenticatedUserId, args.userId);

        assertMaxLen(args.localId, LIMITS.maxLocalIdChars, "localId");
        assertMaxLen(args.content, LIMITS.maxMessageContentChars, "content");
        assertMaxLen(
            args.contextContent,
            LIMITS.maxMessageContextChars,
            "contextContent",
        );
        assertMaxLen(args.thinking, LIMITS.maxMessageThinkingChars, "thinking");

        const chat = await ctx.db.get(args.chatId);
        if (!isOwner(chat, authenticatedUserId)) {
            throw new Error("Chat not found");
        }

        const usage = await ensureCloudUsageCounters(ctx, authenticatedUserId);
        if (usage.messageCount >= LIMITS.maxMessagesPerUser) {
            throw new Error("Message limit reached");
        }

        const now = Date.now();

        // Create the message
        const messageId = await ctx.db.insert("messages", {
            userId: authenticatedUserId,
            chatId: args.chatId,
            localId: args.localId,
            role: args.role,
            content: args.content,
            contextContent: args.contextContent,
            thinking: args.thinking,
            modelId: args.modelId,
            thinkingLevel: args.thinkingLevel,
            searchLevel: args.searchLevel,
            createdAt: args.createdAt ?? now,
        });

        // Update the chat's updatedAt timestamp
        await ctx.db.patch(args.chatId, {
            updatedAt: args.createdAt ?? now,
        });

        await applyCloudUsageDelta(ctx, authenticatedUserId, {
            messageCount: 1,
        });

        return messageId;
    },
});

// Update a message
export const update = mutation({
    args: {
        id: v.id("messages"),
        content: v.optional(v.string()),
        contextContent: v.optional(v.string()),
        thinking: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const authenticatedUserId = await requireCloudSync(ctx);
        const message = await ctx.db.get(args.id);
        if (!isOwner(message, authenticatedUserId)) {
            throw new Error("Not found");
        }

        assertMaxLen(args.content, LIMITS.maxMessageContentChars, "content");
        assertMaxLen(
            args.contextContent,
            LIMITS.maxMessageContextChars,
            "contextContent",
        );
        assertMaxLen(args.thinking, LIMITS.maxMessageThinkingChars, "thinking");

        const { id, ...updates } = args;
        const filteredUpdates = Object.fromEntries(
            Object.entries(updates).filter(([, v]) => v !== undefined),
        );
        await ctx.db.patch(id, filteredUpdates);
    },
});

// Delete a message
export const remove = mutation({
    args: { id: v.id("messages") },
    handler: async (ctx, args) => {
        const authenticatedUserId = await requireCloudSync(ctx);
        const message = await ctx.db.get(args.id);
        if (!isOwner(message, authenticatedUserId)) {
            throw new Error("Not found");
        }

        await ctx.db.delete(args.id);

        await applyCloudUsageDelta(ctx, authenticatedUserId, {
            messageCount: -1,
        });
    },
});

// Delete all messages for a chat
export const deleteByChat = mutation({
    args: { chatId: v.id("chats") },
    handler: async (ctx, args) => {
        const authenticatedUserId = await requireCloudSync(ctx);
        const chat = await ctx.db.get(args.chatId);
        if (!isOwner(chat, authenticatedUserId)) {
            throw new Error("Chat not found");
        }

        let deletedMessages = 0;
        await drainBatches(
            () =>
                ctx.db
                    .query("messages")
                    .withIndex("by_chat", (q) => q.eq("chatId", args.chatId))
                    .take(100),
            async (message: any) => {
                deletedMessages++;
                await ctx.db.delete(message._id);
            },
        );

        await applyCloudUsageDelta(ctx, authenticatedUserId, {
            messageCount: -deletedMessages,
        });
    },
});
