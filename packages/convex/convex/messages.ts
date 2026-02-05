import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

/**
 * Message Operations
 *
 * CRUD operations for messages within chat sessions.
 */

// Get all messages for a chat, sorted by createdAt ascending
export const listByChat = query({
    args: { chatId: v.id("chats") },
    handler: async (ctx, args) => {
        const messages = await ctx.db
            .query("messages")
            .withIndex("by_chat_created", (q) => q.eq("chatId", args.chatId))
            .order("asc")
            .collect();
        return messages;
    },
});

// Get a single message by ID
export const get = query({
    args: { id: v.id("messages") },
    handler: async (ctx, args) => {
        return await ctx.db.get(args.id);
    },
});

// Get message by local ID (for migration)
export const getByLocalId = query({
    args: {
        userId: v.id("users"),
        localId: v.string(),
    },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("messages")
            .withIndex("by_local_id", (q) =>
                q.eq("userId", args.userId).eq("localId", args.localId),
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
        skill: v.optional(v.any()),
        modelId: v.optional(v.string()),
        thinkingLevel: v.optional(v.string()),
        searchLevel: v.optional(v.string()),
        attachmentIds: v.optional(v.array(v.string())),
        createdAt: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const now = Date.now();

        // Create the message
        const messageId = await ctx.db.insert("messages", {
            userId: args.userId,
            chatId: args.chatId,
            localId: args.localId,
            role: args.role,
            content: args.content,
            contextContent: args.contextContent,
            thinking: args.thinking,
            skill: args.skill,
            modelId: args.modelId,
            thinkingLevel: args.thinkingLevel,
            searchLevel: args.searchLevel,
            attachmentIds: args.attachmentIds,
            createdAt: args.createdAt ?? now,
        });

        // Update the chat's updatedAt timestamp
        await ctx.db.patch(args.chatId, {
            updatedAt: args.createdAt ?? now,
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
        attachmentIds: v.optional(v.array(v.string())),
    },
    handler: async (ctx, args) => {
        const { id, ...updates } = args;
        const filteredUpdates = Object.fromEntries(
            Object.entries(updates).filter(([, v]) => v !== undefined),
        );
        await ctx.db.patch(id, filteredUpdates);
    },
});

// Delete a message and its attachments
export const remove = mutation({
    args: { id: v.id("messages") },
    handler: async (ctx, args) => {
        // Get and delete all attachments for this message
        const attachments = await ctx.db
            .query("attachments")
            .withIndex("by_message", (q) => q.eq("messageId", args.id))
            .collect();

        for (const attachment of attachments) {
            await ctx.storage.delete(attachment.storageId);
            await ctx.db.delete(attachment._id);
        }

        // Delete the message
        await ctx.db.delete(args.id);
    },
});

// Delete all messages for a chat
export const deleteByChat = mutation({
    args: { chatId: v.id("chats") },
    handler: async (ctx, args) => {
        const messages = await ctx.db
            .query("messages")
            .withIndex("by_chat", (q) => q.eq("chatId", args.chatId))
            .collect();

        for (const message of messages) {
            // Delete attachments
            const attachments = await ctx.db
                .query("attachments")
                .withIndex("by_message", (q) => q.eq("messageId", message._id))
                .collect();

            for (const attachment of attachments) {
                await ctx.storage.delete(attachment.storageId);
                await ctx.db.delete(attachment._id);
            }

            // Delete message
            await ctx.db.delete(message._id);
        }
    },
});
