import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import {
    internalMutation,
    internalQuery,
    mutation,
    query,
    type MutationCtx,
    type QueryCtx,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { isOwner, requireUserMatches } from "./lib/authz";
import { requireWorkspaceUser } from "./lib/subscription";
import { assertMaxLen, LIMITS } from "./lib/limits";
import { clampPaginationOpts } from "./lib/pagination";
import { drainBatches } from "./lib/batch";
import {
    applyWorkspaceUsageDelta,
    ensureWorkspaceUsageCounters,
} from "./lib/workspace_usage";

/**
 * Chat Operations
 *
 * CRUD operations for chat sessions (conversations) in the workspace.
 */

function pickMostRecentChat(chats: Doc<"chats">[]): Doc<"chats"> | null {
    return (
        chats.slice().sort((left, right) => {
            const updatedAtDelta = right.updatedAt - left.updatedAt;
            if (updatedAtDelta !== 0) {
                return updatedAtDelta;
            }

            const createdAtDelta = right.createdAt - left.createdAt;
            if (createdAtDelta !== 0) {
                return createdAtDelta;
            }

            return String(right._id).localeCompare(String(left._id));
        })[0] ?? null
    );
}

async function getChatByAgentLocalId(
    ctx: Pick<QueryCtx | MutationCtx, "db">,
    args: {
        userId: Id<"users">;
        agentId: string;
        localId: string;
    },
): Promise<Doc<"chats"> | null> {
    const chats = await ctx.db
        .query("chats")
        .withIndex("by_userId_and_agentId_and_localId", (q) =>
            q
                .eq("userId", args.userId)
                .eq("agentId", args.agentId)
                .eq("localId", args.localId),
        )
        .collect();
    return pickMostRecentChat(chats);
}

// Get all chats for a user, sorted by updatedAt descending
export const listByUser = query({
    args: { userId: v.id("users") },
    handler: async (ctx, args) => {
        const authenticatedUserId = await requireWorkspaceUser(ctx);
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
        const authenticatedUserId = await requireWorkspaceUser(ctx);
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
        const authenticatedUserId = await requireWorkspaceUser(ctx);
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
        const authenticatedUserId = await requireWorkspaceUser(ctx);
        const chat = await ctx.db.get(args.id);
        if (!isOwner(chat, authenticatedUserId)) return null;
        return chat;
    },
});

// Get chat by the client-visible conversation id.
export const getByLocalId = query({
    args: {
        userId: v.id("users"),
        agentId: v.string(),
        localId: v.string(),
    },
    handler: async (ctx, args) => {
        const authenticatedUserId = await requireWorkspaceUser(ctx);
        requireUserMatches(authenticatedUserId, args.userId);
        assertMaxLen(args.localId, LIMITS.maxLocalIdChars, "localId");
        assertMaxLen(args.agentId, LIMITS.maxLocalIdChars, "agentId");

        return await getChatByAgentLocalId(ctx, {
            userId: authenticatedUserId,
            agentId: args.agentId,
            localId: args.localId,
        });
    },
});

export const getByLocalIdInternal = internalQuery({
    args: {
        userId: v.id("users"),
        agentId: v.string(),
        localId: v.string(),
    },
    handler: async (ctx, args) => {
        assertMaxLen(args.localId, LIMITS.maxLocalIdChars, "localId");
        assertMaxLen(args.agentId, LIMITS.maxLocalIdChars, "agentId");

        return await getChatByAgentLocalId(ctx, args);
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
        variantId: v.union(v.string(), v.null()),
        createdAt: v.optional(v.number()),
        updatedAt: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const authenticatedUserId = await requireWorkspaceUser(ctx);
        requireUserMatches(authenticatedUserId, args.userId);

        assertMaxLen(args.localId, LIMITS.maxLocalIdChars, "localId");
        assertMaxLen(args.agentId, LIMITS.maxLocalIdChars, "agentId");
        assertMaxLen(args.title, LIMITS.maxChatTitleChars, "title");

        if (args.localId) {
            const existing = await ctx.db
                .query("chats")
                .withIndex("by_userId_and_agentId_and_localId", (q) =>
                    q
                        .eq("userId", authenticatedUserId)
                        .eq("agentId", args.agentId)
                        .eq("localId", args.localId),
                )
                .collect();
            if (existing.length > 0) {
                throw new Error(
                    "Conversation localId already exists for this agent.",
                );
            }
        }

        const usage = await ensureWorkspaceUsageCounters(
            ctx,
            authenticatedUserId,
        );
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
            variantId: args.variantId,
            settingsLockedAt: null,
            createdAt: args.createdAt ?? now,
            updatedAt: args.updatedAt ?? now,
        });

        await applyWorkspaceUsageDelta(ctx, authenticatedUserId, {
            chatCount: 1,
        });
        return chatId;
    },
});

// Update a chat
export const update = mutation({
    args: {
        id: v.id("chats"),
        title: v.optional(v.string()),
        modelId: v.optional(v.string()),
        variantId: v.optional(v.union(v.string(), v.null())),
    },
    handler: async (ctx, args) => {
        const authenticatedUserId = await requireWorkspaceUser(ctx);
        const chat = await ctx.db.get(args.id);
        if (!chat || !isOwner(chat, authenticatedUserId)) {
            throw new Error("Not found");
        }

        assertMaxLen(args.title, LIMITS.maxChatTitleChars, "title");

        const modelChanged =
            args.modelId !== undefined && args.modelId !== chat.modelId;
        const variantChanged =
            args.variantId !== undefined && args.variantId !== chat.variantId;
        if (
            chat.settingsLockedAt !== null &&
            (modelChanged || variantChanged)
        ) {
            throw new Error(
                "Conversation settings are locked after the first message.",
            );
        }

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

export const markViewed = mutation({
    args: {
        id: v.id("chats"),
        timestamp: v.number(),
    },
    handler: async (ctx, args) => {
        const authenticatedUserId = await requireWorkspaceUser(ctx);
        const chat = await ctx.db.get(args.id);
        if (!chat || !isOwner(chat, authenticatedUserId)) {
            throw new Error("Not found");
        }

        const nextLastViewedAt = Math.max(
            chat.lastViewedAt ?? 0,
            args.timestamp,
        );

        if (nextLastViewedAt === (chat.lastViewedAt ?? null)) {
            return;
        }

        await ctx.db.patch(args.id, {
            lastViewedAt: nextLastViewedAt,
        });
    },
});

export const lockSettingsIfNeeded = internalMutation({
    args: {
        userId: v.id("users"),
        agentId: v.string(),
        localId: v.string(),
        lockedAt: v.number(),
    },
    handler: async (ctx, args) => {
        const chat = await getChatByAgentLocalId(ctx, args);
        if (!chat) {
            throw new Error("Conversation not found");
        }

        if (chat.settingsLockedAt !== null) {
            return chat;
        }

        await ctx.db.patch(chat._id, {
            settingsLockedAt: args.lockedAt,
            updatedAt: Math.max(chat.updatedAt, args.lockedAt),
        });

        return {
            ...chat,
            settingsLockedAt: args.lockedAt,
            updatedAt: Math.max(chat.updatedAt, args.lockedAt),
        };
    },
});

// Delete a chat and all associated messages
export const remove = mutation({
    args: { id: v.id("chats") },
    handler: async (ctx, args) => {
        const authenticatedUserId = await requireWorkspaceUser(ctx);
        const chat = await ctx.db.get(args.id);
        if (!isOwner(chat, authenticatedUserId)) {
            throw new Error("Not found");
        }

        let deletedMessages = 0;

        await drainBatches(
            () =>
                ctx.db
                    .query("run_events")
                    .withIndex("by_chatId_and_createdAt", (q) =>
                        q.eq("chatId", args.id),
                    )
                    .take(200),
            async (event: { _id: string }) => {
                await ctx.db.delete(event._id as Id<"run_events">);
            },
        );

        await drainBatches(
            () =>
                ctx.db
                    .query("runs")
                    .withIndex("by_chatId_and_startedAt", (q) =>
                        q.eq("chatId", args.id),
                    )
                    .take(100),
            async (run: { _id: string }) => {
                await ctx.db.delete(run._id as Id<"runs">);
            },
        );

        await drainBatches(
            () =>
                ctx.db
                    .query("runtime_bindings")
                    .withIndex("by_chatId", (q) => q.eq("chatId", args.id))
                    .take(10),
            async (binding: { _id: string }) => {
                await ctx.db.delete(binding._id as Id<"runtime_bindings">);
            },
        );

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

        await applyWorkspaceUsageDelta(ctx, authenticatedUserId, {
            chatCount: -1,
            messageCount: -deletedMessages,
        });
    },
});

// Get the oldest chat by updatedAt (for purge operations)
export const getOldestByUser = query({
    args: { userId: v.id("users") },
    handler: async (ctx, args) => {
        const authenticatedUserId = await requireWorkspaceUser(ctx);
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
