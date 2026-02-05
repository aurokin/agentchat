import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

export const get = query({
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
        const attachments = await ctx.db
            .query("attachments")
            .withIndex("by_user", (q) => q.eq("userId", args.userId))
            .collect();
        const bytes = attachments.reduce(
            (sum, attachment) =>
                sum + (attachment.purgedAt ? 0 : attachment.size),
            0,
        );

        const chats = await ctx.db
            .query("chats")
            .withIndex("by_user", (q) => q.eq("userId", args.userId))
            .collect();
        const messages = await ctx.db
            .query("messages")
            .withIndex("by_user", (q) => q.eq("userId", args.userId))
            .collect();

        return {
            bytes,
            messageCount: messages.length,
            sessionCount: chats.length,
        };
    },
});

export const create = mutation({
    args: {
        email: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const now = Date.now();
        return await ctx.db.insert("users", {
            email: args.email ?? undefined,
            subscriptionStatus: "none",
            subscriptionTier: "free",
            subscriptionOverridePro: false,
            subscriptionCancelAtPeriodEnd: false,
            entitlementActive: false,
            initialSync: false,
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

        const chats = await ctx.db
            .query("chats")
            .withIndex("by_user", (q) => q.eq("userId", userId))
            .collect();

        for (const chat of chats) {
            const messages = await ctx.db
                .query("messages")
                .withIndex("by_chat", (q) => q.eq("chatId", chat._id))
                .collect();

            for (const message of messages) {
                const attachments = await ctx.db
                    .query("attachments")
                    .withIndex("by_message", (q) =>
                        q.eq("messageId", message._id),
                    )
                    .collect();

                for (const attachment of attachments) {
                    await ctx.storage.delete(attachment.storageId);
                    await ctx.db.delete(attachment._id);
                }

                await ctx.db.delete(message._id);
            }

            await ctx.db.delete(chat._id);
        }

        const remainingAttachments = await ctx.db
            .query("attachments")
            .withIndex("by_user", (q) => q.eq("userId", userId))
            .collect();

        for (const attachment of remainingAttachments) {
            await ctx.storage.delete(attachment.storageId);
            await ctx.db.delete(attachment._id);
        }

        const skills = await ctx.db
            .query("skills")
            .withIndex("by_user", (q) => q.eq("userId", userId))
            .collect();

        for (const skill of skills) {
            await ctx.db.delete(skill._id);
        }
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

export const updateSubscription = mutation({
    args: {
        id: v.id("users"),
        subscriptionStatus: v.union(
            v.literal("active"),
            v.literal("expired"),
            v.literal("none"),
        ),
        subscriptionTier: v.union(v.literal("free"), v.literal("pro")),
        subscriptionExpiresAt: v.optional(v.number()),
        subscriptionCancelAtPeriodEnd: v.optional(v.boolean()),
        entitlementId: v.optional(v.string()),
        entitlementActive: v.optional(v.boolean()),
        entitlementExpiresAt: v.optional(v.number()),
        revenuecatCustomerId: v.optional(v.string()),
        lastWebhookEventId: v.optional(v.string()),
        lastWebhookEventType: v.optional(v.string()),
        lastWebhookEventAt: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const { id, ...updates } = args;
        await ctx.db.patch(id, {
            ...updates,
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

        const subscriptionOverridePro =
            (user as any).subscriptionOverridePro ?? false;
        if (subscriptionOverridePro) {
            return {
                hasCloudSync: true,
                cancelAtPeriodEnd: false,
                expiresAt: null,
                tier: "pro" as const,
                status: "active" as const,
            };
        }

        const entitlementActive = (user as any).entitlementActive ?? false;
        const entitlementExpiresAt = (user as any).entitlementExpiresAt ?? null;
        const subscriptionStatus: "active" | "expired" | "none" =
            entitlementActive
                ? "active"
                : entitlementExpiresAt
                  ? "expired"
                  : "none";
        const subscriptionTier: "pro" | "free" = entitlementActive
            ? "pro"
            : "free";
        const expiresAt =
            (user as any).subscriptionExpiresAt ?? entitlementExpiresAt ?? null;

        return {
            hasCloudSync: entitlementActive,
            cancelAtPeriodEnd:
                (user as any).subscriptionCancelAtPeriodEnd ?? false,
            expiresAt,
            tier: subscriptionTier,
            status: subscriptionStatus,
        };
    },
});
