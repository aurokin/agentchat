import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

/**
 * Chat Operations
 *
 * CRUD operations for chat sessions (conversations) in the cloud.
 */

// Get all chats for a user, sorted by updatedAt descending
export const listByUser = query({
    args: { userId: v.id("users") },
    handler: async (ctx, args) => {
        const chats = await ctx.db
            .query("chats")
            .withIndex("by_user_updated", (q) => q.eq("userId", args.userId))
            .order("desc")
            .collect();
        return chats;
    },
});

// Get a single chat by ID
export const get = query({
    args: { id: v.id("chats") },
    handler: async (ctx, args) => {
        return await ctx.db.get(args.id);
    },
});

// Get chat by local ID (for migration)
export const getByLocalId = query({
    args: {
        userId: v.id("users"),
        localId: v.string(),
    },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("chats")
            .withIndex("by_local_id", (q) =>
                q.eq("userId", args.userId).eq("localId", args.localId),
            )
            .unique();
    },
});

// Create a new chat
export const create = mutation({
    args: {
        userId: v.id("users"),
        localId: v.optional(v.string()),
        title: v.string(),
        modelId: v.string(),
        thinking: v.string(),
        searchLevel: v.string(),
        createdAt: v.optional(v.number()),
        updatedAt: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const now = Date.now();
        return await ctx.db.insert("chats", {
            userId: args.userId,
            localId: args.localId,
            title: args.title,
            modelId: args.modelId,
            thinking: args.thinking,
            searchLevel: args.searchLevel,
            createdAt: args.createdAt ?? now,
            updatedAt: args.updatedAt ?? now,
        });
    },
});

// Update a chat
export const update = mutation({
    args: {
        id: v.id("chats"),
        title: v.optional(v.string()),
        modelId: v.optional(v.string()),
        thinking: v.optional(v.string()),
        searchLevel: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
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

// Delete a chat and all associated messages/attachments
export const remove = mutation({
    args: { id: v.id("chats") },
    handler: async (ctx, args) => {
        // Get all messages for this chat
        const messages = await ctx.db
            .query("messages")
            .withIndex("by_chat", (q) => q.eq("chatId", args.id))
            .collect();

        // Delete attachments for each message
        for (const message of messages) {
            const attachments = await ctx.db
                .query("attachments")
                .withIndex("by_message", (q) => q.eq("messageId", message._id))
                .collect();

            for (const attachment of attachments) {
                // Delete the file from storage
                await ctx.storage.delete(attachment.storageId);
                // Delete the attachment record
                await ctx.db.delete(attachment._id);
            }

            // Delete the message
            await ctx.db.delete(message._id);
        }

        // Delete the chat
        await ctx.db.delete(args.id);
    },
});

// Get the oldest chat by updatedAt (for purge operations)
export const getOldestByUser = query({
    args: { userId: v.id("users") },
    handler: async (ctx, args) => {
        const chat = await ctx.db
            .query("chats")
            .withIndex("by_user_updated", (q) => q.eq("userId", args.userId))
            .order("asc")
            .first();
        return chat;
    },
});
