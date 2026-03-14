import { v } from "convex/values";
import {
    internalMutation,
    internalQuery,
    mutation,
    query,
} from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
    getAccessUserId,
    requireAuthUserId,
    requireUserMatches,
} from "./lib/authz";
import { requireWorkspaceUser } from "./lib/subscription";
import {
    getDisabledUserProfile,
    isAgentchatAuthDisabled,
} from "./lib/auth_mode";
import { drainBatches } from "./lib/batch";
import { normalizeLocalUsername } from "./lib/localAuth";
import {
    computeWorkspaceChatCount,
    computeWorkspaceMessageCount,
    computeWorkspaceUsageCounters,
    ensureWorkspaceUsageCounters,
    readWorkspaceUsageCountersFromUser,
    workspaceUsageCountersToPatch,
    zeroWorkspaceUsageCounters,
} from "./lib/workspace_usage";

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

export const getByEmailInternal = internalQuery({
    args: { email: v.string() },
    handler: async (ctx, args) => {
        const rawEmail = args.email.trim();
        if (!rawEmail) {
            throw new Error("Email is required");
        }

        const candidates = Array.from(
            new Set([rawEmail, rawEmail.toLowerCase()]),
        );
        for (const email of candidates) {
            const user = await ctx.db
                .query("users")
                .withIndex("email", (q) => q.eq("email", email))
                .unique();
            if (user) {
                return user;
            }
        }

        return null;
    },
});

export const getByUsernameInternal = internalQuery({
    args: { username: v.string() },
    handler: async (ctx, args) => {
        const username = normalizeLocalUsername(args.username);
        return await ctx.db
            .query("users")
            .withIndex("username", (q) => q.eq("username", username))
            .unique();
    },
});

export const getCurrentUserId = query({
    args: {},
    handler: async (ctx) => {
        return await getAccessUserId(ctx);
    },
});

export const getStorageUsage = query({
    args: { userId: v.id("users") },
    handler: async (ctx, args) => {
        const authenticatedUserId = await requireWorkspaceUser(ctx);
        requireUserMatches(authenticatedUserId, args.userId);

        const user = await ctx.db.get(authenticatedUserId);
        const cached = readWorkspaceUsageCountersFromUser(user);
        if (cached) {
            return {
                bytes: 0,
                messageCount: cached.messageCount,
                sessionCount: cached.chatCount,
            };
        }

        const [sessionCount, messageCount] = await Promise.all([
            computeWorkspaceChatCount(ctx, authenticatedUserId),
            computeWorkspaceMessageCount(ctx, authenticatedUserId),
        ]);

        return {
            bytes: 0,
            messageCount,
            sessionCount,
        };
    },
});

export const create = internalMutation({
    args: {
        email: v.optional(v.string()),
        username: v.optional(v.string()),
        authProvider: v.optional(v.string()),
        localAuthEnabled: v.optional(v.boolean()),
    },
    handler: async (ctx, args) => {
        const now = Date.now();
        return await ctx.db.insert("users", {
            email: args.email ?? undefined,
            username: args.username ?? undefined,
            authProvider: args.authProvider ?? undefined,
            localAuthEnabled: args.localAuthEnabled ?? undefined,
            workspaceChatCount: 0,
            workspaceMessageCount: 0,
            createdAt: now,
            updatedAt: now,
        });
    },
});

async function findUserByEmail(
    ctx: Pick<MutationCtx, "db"> | Pick<QueryCtx, "db">,
    email: string,
) {
    return await ctx.db
        .query("users")
        .withIndex("email", (q) => q.eq("email", email))
        .unique();
}

async function ensureDefaultUser(ctx: MutationCtx): Promise<Id<"users">> {
    const profile = getDisabledUserProfile();
    const existing = await findUserByEmail(ctx, profile.email);
    const now = Date.now();

    if (existing) {
        await ctx.db.patch(existing._id, {
            name: profile.name,
            email: profile.email,
            authProvider: "disabled",
            updatedAt: now,
        });
        return existing._id;
    }

    return await ctx.db.insert("users", {
        name: profile.name,
        email: profile.email,
        authProvider: "disabled",
        workspaceChatCount: 0,
        workspaceMessageCount: 0,
        createdAt: now,
        updatedAt: now,
    });
}

async function resolveAccessUserForMutation(
    ctx: MutationCtx,
): Promise<Id<"users">> {
    if (isAgentchatAuthDisabled()) {
        return await ensureDefaultUser(ctx);
    }

    const userId = await getAccessUserId(ctx);
    if (!userId) {
        throw new Error("Not authenticated");
    }

    return userId;
}

export const ensureAccessUser = mutation({
    args: {},
    handler: async (ctx) => {
        if (isAgentchatAuthDisabled()) {
            return await ensureDefaultUser(ctx);
        }

        const userId = await requireAuthUserId(ctx);
        const user = await ctx.db.get(userId);
        if (!user) {
            throw new Error("Authenticated user not found");
        }
        return userId;
    },
});

export const resetWorkspaceData = mutation({
    args: {},
    handler: async (ctx) => {
        const userId = await resolveAccessUserForMutation(ctx);

        await drainBatches(
            () =>
                ctx.db
                    .query("run_events")
                    .withIndex("by_userId_and_createdAt", (q) =>
                        q.eq("userId", userId),
                    )
                    .take(500),
            async (event: any) => {
                await ctx.db.delete(event._id);
            },
        );

        await drainBatches(
            () =>
                ctx.db
                    .query("runs")
                    .withIndex("by_userId_and_startedAt", (q) =>
                        q.eq("userId", userId),
                    )
                    .take(200),
            async (run: any) => {
                await ctx.db.delete(run._id);
            },
        );

        await drainBatches(
            () =>
                ctx.db
                    .query("runtime_bindings")
                    .withIndex("by_userId_and_updatedAt", (q) =>
                        q.eq("userId", userId),
                    )
                    .take(100),
            async (binding: any) => {
                await ctx.db.delete(binding._id);
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
            workspaceUsageCountersToPatch(zeroWorkspaceUsageCounters()) as any,
        );
    },
});

export const ensureWorkspaceUsage = mutation({
    args: {},
    handler: async (ctx) => {
        const userId = await requireWorkspaceUser(ctx);
        return await ensureWorkspaceUsageCounters(ctx, userId);
    },
});

async function rebuildUsageCounters(
    ctx: { db: { patch: (...args: any[]) => Promise<void> } },
    userId: any,
) {
    const computed = await computeWorkspaceUsageCounters(ctx as any, userId);
    await ctx.db.patch(userId, {
        ...workspaceUsageCountersToPatch(computed),
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
