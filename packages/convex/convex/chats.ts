import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { mutation, query } from "./_generated/server";
import { isOwner, requireUserMatches } from "./lib/authz";
import { requireCloudSync } from "./lib/subscription";
import { assertMaxLen, LIMITS } from "./lib/limits";
import { clampPaginationOpts } from "./lib/pagination";
import { drainBatches } from "./lib/batch";
import {
    applyCloudUsageDelta,
    ensureCloudUsageCounters,
} from "./lib/cloud_usage";

/**
 * Chat Operations
 *
 * CRUD operations for chat sessions (conversations) in the cloud.
 */

// Get all chats for a user, sorted by updatedAt descending
export const listByUser = query({
    args: { userId: v.id("users") },
    handler: async (ctx, args) => {
        const authenticatedUserId = await requireCloudSync(ctx);
        requireUserMatches(authenticatedUserId, args.userId);

        const chats = await ctx.db
            .query("chats")
            .withIndex("by_user_updated", (q) =>
                q.eq("userId", authenticatedUserId),
            )
            .order("desc")
            .take(LIMITS.maxListChats);
        return chats;
    },
});

// Paginated chat listing (for infinite scroll UIs)
export const listByUserPaginated = query({
    args: {
        userId: v.id("users"),
        paginationOpts: paginationOptsValidator,
    },
    handler: async (ctx, args) => {
        const authenticatedUserId = await requireCloudSync(ctx);
        requireUserMatches(authenticatedUserId, args.userId);

        const paginationOpts = clampPaginationOpts(
            args.paginationOpts,
            LIMITS.maxPageChats,
        );

        return await ctx.db
            .query("chats")
            .withIndex("by_user_updated", (q) =>
                q.eq("userId", authenticatedUserId),
            )
            .order("desc")
            .paginate(paginationOpts);
    },
});

export const listByUserAndAgentPaginated = query({
    args: {
        userId: v.id("users"),
        agentId: v.string(),
        paginationOpts: paginationOptsValidator,
    },
    handler: async (ctx, args) => {
        const authenticatedUserId = await requireCloudSync(ctx);
        requireUserMatches(authenticatedUserId, args.userId);
        assertMaxLen(args.agentId, LIMITS.maxLocalIdChars, "agentId");

        const paginationOpts = clampPaginationOpts(
            args.paginationOpts,
            LIMITS.maxPageChats,
        );

        return await ctx.db
            .query("chats")
            .withIndex("by_userId_and_agentId_and_updatedAt", (q) =>
                q.eq("userId", authenticatedUserId).eq("agentId", args.agentId),
            )
            .order("desc")
            .paginate(paginationOpts);
    },
});

// Get a single chat by ID
export const get = query({
    args: { id: v.id("chats") },
    handler: async (ctx, args) => {
        const authenticatedUserId = await requireCloudSync(ctx);
        const chat = await ctx.db.get(args.id);
        if (!isOwner(chat, authenticatedUserId)) return null;
        return chat;
    },
});

// Get chat by local ID (for migration)
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
            .query("chats")
            .withIndex("by_local_id", (q) =>
                q.eq("userId", authenticatedUserId).eq("localId", args.localId),
            )
            .unique();
    },
});

// Create a new chat
export const create = mutation({
    args: {
        userId: v.id("users"),
        localId: v.optional(v.string()),
        agentId: v.string(),
        title: v.string(),
        modelId: v.string(),
        thinking: v.string(),
        createdAt: v.optional(v.number()),
        updatedAt: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const authenticatedUserId = await requireCloudSync(ctx);
        requireUserMatches(authenticatedUserId, args.userId);

        assertMaxLen(args.localId, LIMITS.maxLocalIdChars, "localId");
        assertMaxLen(args.agentId, LIMITS.maxLocalIdChars, "agentId");
        assertMaxLen(args.title, LIMITS.maxChatTitleChars, "title");

        const usage = await ensureCloudUsageCounters(ctx, authenticatedUserId);
        if (usage.chatCount >= LIMITS.maxChatsPerUser) {
            throw new Error("Chat limit reached");
        }

        const now = Date.now();
        const chatId = await ctx.db.insert("chats", {
            userId: authenticatedUserId,
            localId: args.localId,
            agentId: args.agentId,
            title: args.title,
            modelId: args.modelId,
            thinking: args.thinking,
            createdAt: args.createdAt ?? now,
            updatedAt: args.updatedAt ?? now,
        });

        await applyCloudUsageDelta(ctx, authenticatedUserId, { chatCount: 1 });
        return chatId;
    },
});

// Update a chat
export const update = mutation({
    args: {
        id: v.id("chats"),
        title: v.optional(v.string()),
        modelId: v.optional(v.string()),
        thinking: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const authenticatedUserId = await requireCloudSync(ctx);
        const chat = await ctx.db.get(args.id);
        if (!isOwner(chat, authenticatedUserId)) {
            throw new Error("Not found");
        }

        assertMaxLen(args.title, LIMITS.maxChatTitleChars, "title");

        const { id, ...updates } = args;
        const filteredUpdates = Object.fromEntries(
            Object.entries(updates).filter(([, v]) => v !== undefined),
        );
        await ctx.db.patch(id, {
            ...filteredUpdates,
            updatedAt: Date.now(),
        });
    },
});

// Delete a chat and all associated messages
export const remove = mutation({
    args: { id: v.id("chats") },
    handler: async (ctx, args) => {
        const authenticatedUserId = await requireCloudSync(ctx);
        const chat = await ctx.db.get(args.id);
        if (!isOwner(chat, authenticatedUserId)) {
            throw new Error("Not found");
        }

        let deletedMessages = 0;

        await drainBatches(
            () =>
                ctx.db
                    .query("messages")
                    .withIndex("by_chat", (q) => q.eq("chatId", args.id))
                    .take(100),
            async (message: any) => {
                deletedMessages++;
                await ctx.db.delete(message._id);
            },
        );

        // Delete the chat
        await ctx.db.delete(args.id);

        await applyCloudUsageDelta(ctx, authenticatedUserId, {
            chatCount: -1,
            messageCount: -deletedMessages,
        });
    },
});

// Get the oldest chat by updatedAt (for purge operations)
export const getOldestByUser = query({
    args: { userId: v.id("users") },
    handler: async (ctx, args) => {
        const authenticatedUserId = await requireCloudSync(ctx);
        requireUserMatches(authenticatedUserId, args.userId);

        const chat = await ctx.db
            .query("chats")
            .withIndex("by_user_updated", (q) =>
                q.eq("userId", authenticatedUserId),
            )
            .order("asc")
            .first();
        return chat;
    },
});
