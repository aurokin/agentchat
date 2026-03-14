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
