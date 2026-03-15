import { v } from "convex/values";
import { query, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
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

async function listRuntimeBindingsWithChatsByUser(
    ctx: QueryCtx,
    userId: Id<"users">,
): Promise<
    Array<{
        binding: Doc<"runtime_bindings">;
        chat: Doc<"chats">;
    }>
> {
    const bindings = await ctx.db
        .query("runtime_bindings")
        .withIndex("by_userId_and_updatedAt", (q) => q.eq("userId", userId))
        .collect();

    const chats = await Promise.all(
        bindings.map((binding) => ctx.db.get(binding.chatId)),
    );

    return bindings.flatMap((binding, index) => {
        const chat = chats[index];
        if (!chat) {
            return [];
        }

        return [{ binding, chat }];
    });
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
        const entries = await listRuntimeBindingsWithChatsByUser(
            ctx,
            authenticatedUserId,
        );

        return entries
            .filter(
                ({ binding }) =>
                    binding.status === "active" && binding.activeRunId !== null,
            )
            .map(({ chat }) => ({
                conversationId: chat.localId ?? chat._id,
                agentId: chat.agentId,
            }));
    },
});

export const listByUser = query({
    args: {},
    handler: async (ctx) => {
        const authenticatedUserId = await requireWorkspaceUser(ctx);
        const entries = await listRuntimeBindingsWithChatsByUser(
            ctx,
            authenticatedUserId,
        );

        return entries.flatMap(({ binding, chat }) => {
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

export const listAgentActivityCounts = query({
    args: {},
    handler: async (ctx) => {
        const authenticatedUserId = await requireWorkspaceUser(ctx);
        const entries = await listRuntimeBindingsWithChatsByUser(
            ctx,
            authenticatedUserId,
        );

        const counts = new Map<
            string,
            {
                agentId: string;
                activeCount: number;
                newReplyCount: number;
                needsAttentionCount: number;
            }
        >();

        for (const { binding, chat } of entries) {
            const existing = counts.get(chat.agentId) ?? {
                agentId: chat.agentId,
                activeCount: 0,
                newReplyCount: 0,
                needsAttentionCount: 0,
            };
            const activity = resolvePersistedConversationActivity({
                status: binding.status,
                lastEventAt: binding.lastEventAt,
                lastViewedAt: chat.lastViewedAt ?? null,
            });

            if (activity?.tone === "working") {
                existing.activeCount += 1;
            } else if (activity?.tone === "completed") {
                existing.newReplyCount += 1;
            } else if (activity?.tone === "errored") {
                existing.needsAttentionCount += 1;
            }

            counts.set(chat.agentId, existing);
        }

        return [...counts.values()];
    },
});
