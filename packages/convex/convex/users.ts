import { v } from "convex/values";
import {
    internalMutation,
    internalQuery,
    mutation,
    query,
} from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { requireAuthUserId, requireUserMatches } from "./lib/authz";
import { requireCloudSync } from "./lib/subscription";
import { drainBatches, safeStorageDelete } from "./lib/batch";
import {
    cloudUsageCountersToPatch,
    computeCloudAttachmentUsage,
    computeCloudChatCount,
    computeCloudMessageCount,
    computeCloudUsageCounters,
    ensureCloudUsageCounters,
    readCloudUsageCountersFromUser,
    zeroCloudUsageCounters,
} from "./lib/cloud_usage";

export const get = query({
    args: { id: v.id("users") },
    handler: async (ctx, args) => {
        const authenticatedUserId = await requireAuthUserId(ctx);
        requireUserMatches(authenticatedUserId, args.id);
        return await ctx.db.get(args.id);
    },
});

export const getById = internalQuery({
    args: { id: v.id("users") },
    handler: async (ctx, args) => {
        return await ctx.db.get(args.id);
    },
});

export const getCurrentUserId = query({
    args: {},
    handler: async (ctx) => {
        return await getAuthUserId(ctx);
    },
});

export const getStorageUsage = query({
    args: { userId: v.id("users") },
    handler: async (ctx, args) => {
        const authenticatedUserId = await requireCloudSync(ctx);
        requireUserMatches(authenticatedUserId, args.userId);

        const user = await ctx.db.get(authenticatedUserId);
        const cached = readCloudUsageCountersFromUser(user);
        if (cached) {
            return {
                bytes: cached.attachmentBytes,
                messageCount: cached.messageCount,
                sessionCount: cached.chatCount,
            };
        }

        const [attachments, sessionCount, messageCount] = await Promise.all([
            computeCloudAttachmentUsage(ctx, authenticatedUserId),
            computeCloudChatCount(ctx, authenticatedUserId),
            computeCloudMessageCount(ctx, authenticatedUserId),
        ]);

        return {
            bytes: attachments.attachmentBytes,
            messageCount,
            sessionCount,
        };
    },
});

export const create = internalMutation({
    args: {
        email: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const now = Date.now();
        return await ctx.db.insert("users", {
            email: args.email ?? undefined,
            initialSync: false,
            cloudChatCount: 0,
            cloudMessageCount: 0,
            cloudAttachmentCount: 0,
            cloudAttachmentBytes: 0,
            createdAt: now,
            updatedAt: now,
        });
    },
});

export const resetCloudData = mutation({
    args: {},
    handler: async (ctx) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) {
            throw new Error("Not authenticated");
        }

        // Clear attachments first so we don't have to do nested deletions.
        await drainBatches(
            () =>
                ctx.db
                    .query("attachments")
                    .withIndex("by_user", (q) => q.eq("userId", userId))
                    .take(200),
            async (attachment: any) => {
                await safeStorageDelete(ctx, attachment.storageId);
                await ctx.db.delete(attachment._id);
            },
        );

        await drainBatches(
            () =>
                ctx.db
                    .query("messages")
                    .withIndex("by_user", (q) => q.eq("userId", userId))
                    .take(500),
            async (message: any) => {
                await ctx.db.delete(message._id);
            },
        );

        await drainBatches(
            () =>
                ctx.db
                    .query("chats")
                    .withIndex("by_user", (q) => q.eq("userId", userId))
                    .take(200),
            async (chat: any) => {
                await ctx.db.delete(chat._id);
            },
        );

        await ctx.db.patch(
            userId,
            cloudUsageCountersToPatch(zeroCloudUsageCounters()) as any,
        );
    },
});

export const ensureUsageCounters = mutation({
    args: {},
    handler: async (ctx) => {
        const userId = await requireCloudSync(ctx);
        return await ensureCloudUsageCounters(ctx, userId);
    },
});

async function rebuildUsageCounters(
    ctx: { db: { patch: (...args: any[]) => Promise<void> } },
    userId: any,
) {
    const computed = await computeCloudUsageCounters(ctx as any, userId);
    await ctx.db.patch(userId, {
        ...cloudUsageCountersToPatch(computed),
        updatedAt: Date.now(),
    } as any);
    return computed;
}

// Internal / admin repair tool: recompute from ground truth and overwrite counters.
// This is intended for operations and should not be exposed to clients.
export const rebuildUsageCountersForUser = internalMutation({
    args: { userId: v.id("users") },
    handler: async (ctx, args) => {
        return await rebuildUsageCounters(ctx as any, args.userId);
    },
});

export const rebuildUsageCountersForEmail = internalMutation({
    args: { email: v.string() },
    handler: async (ctx, args) => {
        const rawEmail = args.email.trim();
        if (!rawEmail) {
            throw new Error("Email is required");
        }

        const candidates = Array.from(
            new Set([rawEmail, rawEmail.toLowerCase()]),
        );
        let user: any = null;
        for (const email of candidates) {
            user = await ctx.db
                .query("users")
                .withIndex("email", (q) => q.eq("email", email))
                .unique();
            if (user) break;
        }
        if (!user) {
            throw new Error("User not found");
        }

        return await rebuildUsageCounters(ctx as any, user._id);
    },
});

export const setInitialSync = mutation({
    args: {
        initialSync: v.boolean(),
    },
    handler: async (ctx, args) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) {
            throw new Error("Not authenticated");
        }

        await ctx.db.patch(userId, {
            initialSync: args.initialSync,
            updatedAt: Date.now(),
        });
    },
});

export const getSubscriptionStatus = query({
    args: {},
    handler: async (ctx) => {
        const userId = await getAuthUserId(ctx);

        if (!userId) {
            return {
                hasCloudSync: false,
                cancelAtPeriodEnd: false,
                expiresAt: null,
                tier: "free" as const,
                status: "none" as const,
            };
        }

        const user = await ctx.db.get(userId);
        if (!user) {
            return {
                hasCloudSync: false,
                cancelAtPeriodEnd: false,
                expiresAt: null,
                tier: "free" as const,
                status: "none" as const,
            };
        }

        return {
            hasCloudSync: true,
            cancelAtPeriodEnd: false,
            expiresAt: null,
            tier: "pro" as const,
            status: "active" as const,
        };
    },
});
