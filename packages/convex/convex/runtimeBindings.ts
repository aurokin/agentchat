import { v } from "convex/values";
import { query } from "./_generated/server";
import { isOwner } from "./lib/authz";
import { requireWorkspaceUser } from "./lib/subscription";

type ConversationActivity =
    | {
          label: "Working";
          tone: "working";
      }
    | {
          label: "New reply";
          tone: "completed";
      }
    | {
          label: "Needs attention";
          tone: "errored";
      }
    | null;

export function resolvePersistedConversationActivity(params: {
    status: "idle" | "active" | "expired" | "errored";
    lastEventAt: number | null;
    lastViewedAt: number | null;
}): ConversationActivity {
    if (params.status === "active") {
        return {
            label: "Working",
            tone: "working",
        };
    }

    if (params.status === "errored") {
        return {
            label: "Needs attention",
            tone: "errored",
        };
    }

    if (params.lastEventAt === null) {
        return null;
    }

    if (
        params.lastViewedAt === null ||
        params.lastEventAt > params.lastViewedAt
    ) {
        return {
            label: "New reply",
            tone: "completed",
        };
    }

    return null;
}

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

export const listByUser = query({
    args: {},
    handler: async (ctx) => {
        const authenticatedUserId = await requireWorkspaceUser(ctx);
        const bindings = await ctx.db
            .query("runtime_bindings")
            .withIndex("by_userId_and_updatedAt", (q) =>
                q.eq("userId", authenticatedUserId),
            )
            .collect();

        const chats = await Promise.all(
            bindings.map((binding) => ctx.db.get(binding.chatId)),
        );

        return bindings.flatMap((binding, index) => {
            const chat = chats[index];
            if (!chat) {
                return [];
            }

            return [
                {
                    conversationId: chat.localId ?? chat._id,
                    agentId: chat.agentId,
                    status: binding.status,
                    activeRunId: binding.activeRunId,
                    lastError: binding.lastError,
                    lastEventAt: binding.lastEventAt,
                    updatedAt: binding.updatedAt,
                    activity: resolvePersistedConversationActivity({
                        status: binding.status,
                        lastEventAt: binding.lastEventAt,
                        lastViewedAt: chat.lastViewedAt ?? null,
                    }),
                },
            ];
        });
    },
});
