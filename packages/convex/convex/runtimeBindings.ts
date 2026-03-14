import { v } from "convex/values";
import { query } from "./_generated/server";
import { isOwner } from "./lib/authz";
import { requireWorkspaceUser } from "./lib/subscription";

export const getByChat = query({
    args: {
        chatId: v.id("chats"),
    },
    handler: async (ctx, args) => {
        const authenticatedUserId = await requireWorkspaceUser(ctx);
        const chat = await ctx.db.get(args.chatId);
        if (!isOwner(chat, authenticatedUserId)) {
            return null;
        }

        const binding = await ctx.db
            .query("runtime_bindings")
            .withIndex("by_chatId", (q) => q.eq("chatId", args.chatId))
            .unique();
        if (!binding) {
            return null;
        }

        return {
            provider: binding.provider,
            status: binding.status,
            activeRunId: binding.activeRunId,
            lastError: binding.lastError,
            lastEventAt: binding.lastEventAt,
            updatedAt: binding.updatedAt,
        };
    },
});

export const listActiveConversationIds = query({
    args: {},
    handler: async (ctx) => {
        const authenticatedUserId = await requireWorkspaceUser(ctx);
        const bindings = await ctx.db
            .query("runtime_bindings")
            .withIndex("by_userId_and_updatedAt", (q) =>
                q.eq("userId", authenticatedUserId),
            )
            .collect();

        const activeBindings = bindings.filter(
            (binding) =>
                binding.status === "active" && binding.activeRunId !== null,
        );
        const chats = await Promise.all(
            activeBindings.map((binding) => ctx.db.get(binding.chatId)),
        );

        return chats
            .filter((chat): chat is NonNullable<typeof chat> => chat !== null)
            .map((chat) => ({
                conversationId: chat.localId ?? chat._id,
                agentId: chat.agentId,
            }));
    },
});
