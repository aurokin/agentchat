import { v } from "convex/values";
import {
    internalMutation,
    internalQuery,
    type MutationCtx,
    type QueryCtx,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
    type RunStatus,
    isTerminalRunStatus,
} from "../../shared/src/core/types";

type RuntimeStatus = "idle" | "active" | "expired" | "errored";
type MessageStatus =
    | "draft"
    | "streaming"
    | "completed"
    | "interrupted"
    | "errored";
type RunEventKind =
    | "run_started"
    | "message_started"
    | "message_delta"
    | "message_completed"
    | "run_completed"
    | "run_interrupted"
    | "run_failed"
    | "approval_requested"
    | "approval_resolved"
    | "user_input_requested"
    | "user_input_resolved"
    | "provider_status";

type RuntimeMutationCtx = MutationCtx;
type RuntimeQueryCtx = QueryCtx;

const runtimeStatusValidator = v.union(
    v.literal("idle"),
    v.literal("active"),
    v.literal("expired"),
    v.literal("errored"),
);

async function getChatByConversationId(
    ctx: RuntimeMutationCtx,
    args: {
        userId: Id<"users">;
        agentId: string;
        conversationLocalId: string;
    },
): Promise<Doc<"chats">> {
    const chat = await findChatByConversationId(ctx, args);
    if (!chat) {
        throw new Error("Conversation not found");
    }
    return chat;
}

async function findChatByConversationId(
    ctx: RuntimeMutationCtx | RuntimeQueryCtx,
    args: {
        userId: Id<"users">;
        agentId: string;
        conversationLocalId: string;
    },
): Promise<Doc<"chats"> | null> {
    const chat = await ctx.db
        .query("chats")
        .withIndex("by_userId_and_agentId_and_localId", (q) =>
            q
                .eq("userId", args.userId)
                .eq("agentId", args.agentId)
                .eq("localId", args.conversationLocalId),
        )
        .unique();
    if (chat) {
        return chat;
    }

    if (!args.conversationLocalId.includes(":")) {
        return null;
    }

    const legacyChats = await ctx.db
        .query("chats")
        .withIndex("by_user", (q) => q.eq("userId", args.userId))
        .collect();
    return (
        legacyChats.find(
            (candidate) =>
                candidate.agentId === args.agentId &&
                (candidate.localId ?? candidate._id) ===
                    args.conversationLocalId,
        ) ?? null
    );
}

async function getMessageByLocalId(
    ctx: RuntimeMutationCtx,
    args: { userId: Id<"users">; localId: string },
): Promise<Doc<"messages"> | null> {
    return await ctx.db
        .query("messages")
        .withIndex("by_local_id", (q) =>
            q.eq("userId", args.userId).eq("localId", args.localId),
        )
        .unique();
}

async function getRunByExternalId(
    ctx: RuntimeMutationCtx,
    externalId: string,
): Promise<Doc<"runs"> | null> {
    return await ctx.db
        .query("runs")
        .withIndex("by_externalId", (q) => q.eq("externalId", externalId))
        .unique();
}

async function getRuntimeBindingByChatId(
    ctx: RuntimeMutationCtx,
    chatId: Id<"chats">,
): Promise<Doc<"runtime_bindings"> | null> {
    return await ctx.db
        .query("runtime_bindings")
        .withIndex("by_chatId", (q) => q.eq("chatId", chatId))
        .unique();
}

async function getChatByConversationIdForQuery(
    ctx: RuntimeQueryCtx,
    args: {
        userId: Id<"users">;
        agentId: string;
        conversationLocalId: string;
    },
): Promise<Doc<"chats"> | null> {
    return await findChatByConversationId(ctx, args);
}

async function getRuntimeBindingByChatIdForQuery(
    ctx: RuntimeQueryCtx,
    chatId: Id<"chats">,
): Promise<Doc<"runtime_bindings"> | null> {
    return await ctx.db
        .query("runtime_bindings")
        .withIndex("by_chatId", (q) => q.eq("chatId", chatId))
        .unique();
}

async function appendRunEvent(
    ctx: RuntimeMutationCtx,
    args: {
        runId: Id<"runs">;
        chatId: Id<"chats">;
        userId: Id<"users">;
        sequence: number;
        kind: RunEventKind;
        messageId: Id<"messages"> | null;
        textDelta?: string | null;
        errorMessage?: string | null;
        data?: string | null;
        createdAt: number;
    },
): Promise<void> {
    await ctx.db.insert("run_events", {
        runId: args.runId,
        chatId: args.chatId,
        userId: args.userId,
        sequence: args.sequence,
        kind: args.kind,
        messageId: args.messageId,
        textDelta: args.textDelta ?? null,
        errorMessage: args.errorMessage ?? null,
        data: args.data ?? null,
        createdAt: args.createdAt,
    });
}

async function upsertRuntimeBinding(
    ctx: RuntimeMutationCtx,
    args: {
        chatId: Id<"chats">;
        userId: Id<"users">;
        provider: string;
        status: RuntimeStatus;
        providerThreadId: string | null;
        providerResumeToken: string | null;
        activeRunId: string | null;
        lastError: string | null;
        lastEventAt: number | null;
        expiresAt: number | null;
        workspaceMode?: "shared" | "copy-on-conversation";
        workspaceRootPath?: string;
        workspaceCwd?: string;
        updatedAt: number;
    },
): Promise<void> {
    const existing = await getRuntimeBindingByChatId(ctx, args.chatId);
    const payload = {
        chatId: args.chatId,
        userId: args.userId,
        provider: args.provider,
        status: args.status,
        providerThreadId: args.providerThreadId,
        providerResumeToken: args.providerResumeToken,
        activeRunId: args.activeRunId,
        lastError: args.lastError,
        lastEventAt: args.lastEventAt,
        expiresAt: args.expiresAt,
        workspaceMode: args.workspaceMode ?? existing?.workspaceMode,
        workspaceRootPath:
            args.workspaceRootPath ?? existing?.workspaceRootPath,
        workspaceCwd: args.workspaceCwd ?? existing?.workspaceCwd,
        updatedAt: args.updatedAt,
    };

    if (existing) {
        await ctx.db.patch(existing._id, payload);
        return;
    }

    await ctx.db.insert("runtime_bindings", payload);
}

async function updateAssistantMessage(
    ctx: RuntimeMutationCtx,
    args: {
        userId: Id<"users">;
        localId: string;
        kind?: "assistant_message" | "assistant_status";
        content: string;
        status: MessageStatus;
        runId: string;
        runMessageIndex?: number;
        updatedAt: number;
        completedAt: number | null;
    },
): Promise<Doc<"messages">> {
    const message = await getMessageByLocalId(ctx, {
        userId: args.userId,
        localId: args.localId,
    });
    if (!message) {
        throw new Error("Assistant message not found");
    }

    await ctx.db.patch(message._id, {
        kind: args.kind ?? message.kind,
        content: args.content,
        contextContent: args.content,
        status: args.status,
        runId: args.runId,
        runMessageIndex:
            args.runMessageIndex ?? message.runMessageIndex ?? null,
        updatedAt: args.updatedAt,
        completedAt: args.completedAt,
    });

    return {
        ...message,
        kind: args.kind ?? message.kind,
        content: args.content,
        contextContent: args.content,
        status: args.status,
        runId: args.runId,
        runMessageIndex:
            args.runMessageIndex ?? message.runMessageIndex ?? null,
        updatedAt: args.updatedAt,
        completedAt: args.completedAt,
    };
}

async function createAssistantMessage(
    ctx: RuntimeMutationCtx,
    args: {
        userId: Id<"users">;
        chatId: Id<"chats">;
        localId: string;
        kind: "assistant_message" | "assistant_status";
        content: string;
        runId: string;
        runMessageIndex: number;
        createdAt: number;
    },
): Promise<Doc<"messages">> {
    const existing = await getMessageByLocalId(ctx, {
        userId: args.userId,
        localId: args.localId,
    });
    if (existing) {
        await ctx.db.patch(existing._id, {
            role: "assistant",
            kind: args.kind,
            content: args.content,
            contextContent: args.content,
            status: "streaming",
            runId: args.runId,
            runMessageIndex: args.runMessageIndex,
            updatedAt: args.createdAt,
            completedAt: null,
        });
        return {
            ...existing,
            role: "assistant",
            kind: args.kind,
            content: args.content,
            contextContent: args.content,
            status: "streaming",
            runId: args.runId,
            runMessageIndex: args.runMessageIndex,
            updatedAt: args.createdAt,
            completedAt: null,
        };
    }

    const messageId = await ctx.db.insert("messages", {
        userId: args.userId,
        chatId: args.chatId,
        localId: args.localId,
        role: "assistant",
        kind: args.kind,
        content: args.content,
        contextContent: args.content,
        status: "streaming",
        runId: args.runId,
        reasoning: undefined,
        runMessageIndex: args.runMessageIndex,
        modelId: undefined,
        variantId: null,
        reasoningEffort: undefined,
        createdAt: args.createdAt,
        updatedAt: args.createdAt,
        completedAt: null,
    });

    const message = await ctx.db.get(messageId);
    if (!message) {
        throw new Error("Failed to create assistant message");
    }
    return message;
}

export const runStarted = internalMutation({
    args: {
        userId: v.id("users"),
        agentId: v.string(),
        conversationLocalId: v.string(),
        triggerMessageLocalId: v.string(),
        assistantMessageLocalId: v.string(),
        externalRunId: v.string(),
        provider: v.string(),
        providerThreadId: v.union(v.string(), v.null()),
        providerTurnId: v.union(v.string(), v.null()),
        startedAt: v.number(),
    },
    handler: async (ctx, args) => {
        const chat = await getChatByConversationId(ctx, {
            userId: args.userId,
            agentId: args.agentId,
            conversationLocalId: args.conversationLocalId,
        });
        const triggerMessage = await getMessageByLocalId(ctx, {
            userId: args.userId,
            localId: args.triggerMessageLocalId,
        });
        const assistantMessage = await updateAssistantMessage(ctx, {
            userId: args.userId,
            localId: args.assistantMessageLocalId,
            kind: "assistant_message",
            content: "",
            status: "streaming",
            runId: args.externalRunId,
            runMessageIndex: 0,
            updatedAt: args.startedAt,
            completedAt: null,
        });

        if (chat.settingsLockedAt === null) {
            await ctx.db.patch(chat._id, {
                settingsLockedAt: args.startedAt,
                updatedAt: Math.max(chat.updatedAt, args.startedAt),
            });
        } else {
            await ctx.db.patch(chat._id, {
                updatedAt: Math.max(chat.updatedAt, args.startedAt),
            });
        }

        const existingRun = await getRunByExternalId(ctx, args.externalRunId);
        const runId =
            existingRun?._id ??
            (await ctx.db.insert("runs", {
                userId: args.userId,
                chatId: chat._id,
                externalId: args.externalRunId,
                provider: args.provider,
                status: "running",
                triggerMessageId: triggerMessage?._id ?? null,
                outputMessageId: assistantMessage._id,
                providerThreadId: args.providerThreadId,
                providerTurnId: args.providerTurnId,
                startedAt: args.startedAt,
                completedAt: null,
                errorMessage: null,
            }));

        if (existingRun) {
            await ctx.db.patch(existingRun._id, {
                status: "running",
                triggerMessageId:
                    triggerMessage?._id ?? existingRun.triggerMessageId,
                outputMessageId: assistantMessage._id,
                providerThreadId: args.providerThreadId,
                providerTurnId: args.providerTurnId,
                startedAt: args.startedAt,
                completedAt: null,
                errorMessage: null,
            });
        }

        await appendRunEvent(ctx, {
            runId,
            chatId: chat._id,
            userId: args.userId,
            sequence: 1,
            kind: "run_started",
            messageId: assistantMessage._id,
            createdAt: args.startedAt,
        });
        await appendRunEvent(ctx, {
            runId,
            chatId: chat._id,
            userId: args.userId,
            sequence: 2,
            kind: "message_started",
            messageId: assistantMessage._id,
            data: JSON.stringify({
                kind: "assistant_message",
                runMessageIndex: 0,
            }),
            createdAt: args.startedAt,
        });

        await upsertRuntimeBinding(ctx, {
            chatId: chat._id,
            userId: args.userId,
            provider: args.provider,
            status: "active",
            providerThreadId: args.providerThreadId,
            providerResumeToken: null,
            activeRunId: args.externalRunId,
            lastError: null,
            lastEventAt: args.startedAt,
            expiresAt: null,
            updatedAt: args.startedAt,
        });

        return { runId };
    },
});

export const messageStarted = internalMutation({
    args: {
        userId: v.id("users"),
        agentId: v.string(),
        conversationLocalId: v.string(),
        previousAssistantMessageLocalId: v.string(),
        previousCompletedSequence: v.number(),
        previousKind: v.optional(
            v.union(
                v.literal("assistant_message"),
                v.literal("assistant_status"),
            ),
        ),
        assistantMessageLocalId: v.string(),
        messageStartedSequence: v.number(),
        externalRunId: v.string(),
        kind: v.union(
            v.literal("assistant_message"),
            v.literal("assistant_status"),
        ),
        runMessageIndex: v.number(),
        previousContent: v.string(),
        content: v.string(),
        createdAt: v.number(),
    },
    handler: async (ctx, args) => {
        const chat = await getChatByConversationId(ctx, {
            userId: args.userId,
            agentId: args.agentId,
            conversationLocalId: args.conversationLocalId,
        });
        const run = await getRunByExternalId(ctx, args.externalRunId);
        if (!run) {
            throw new Error("Run not found");
        }

        if (isTerminalRunStatus(run.status)) {
            return;
        }

        const previousMessage = await updateAssistantMessage(ctx, {
            userId: args.userId,
            localId: args.previousAssistantMessageLocalId,
            kind: args.previousKind,
            content: args.previousContent,
            status: "completed",
            runId: args.externalRunId,
            runMessageIndex: args.runMessageIndex - 1,
            updatedAt: args.createdAt,
            completedAt: args.createdAt,
        });

        const assistantMessage = await createAssistantMessage(ctx, {
            userId: args.userId,
            chatId: chat._id,
            localId: args.assistantMessageLocalId,
            kind: args.kind,
            content: args.content,
            runId: args.externalRunId,
            runMessageIndex: args.runMessageIndex,
            createdAt: args.createdAt,
        });

        await ctx.db.patch(run._id, {
            outputMessageId: assistantMessage._id,
        });

        await appendRunEvent(ctx, {
            runId: run._id,
            chatId: chat._id,
            userId: args.userId,
            sequence: args.previousCompletedSequence,
            kind: "message_completed",
            messageId: previousMessage._id,
            createdAt: args.createdAt,
        });
        await appendRunEvent(ctx, {
            runId: run._id,
            chatId: chat._id,
            userId: args.userId,
            sequence: args.messageStartedSequence,
            kind: "message_started",
            messageId: assistantMessage._id,
            data: JSON.stringify({
                kind: args.kind,
                runMessageIndex: args.runMessageIndex,
            }),
            createdAt: args.createdAt,
        });

        await upsertRuntimeBinding(ctx, {
            chatId: chat._id,
            userId: args.userId,
            provider: run.provider,
            status: "active",
            providerThreadId: run.providerThreadId,
            providerResumeToken: null,
            activeRunId: args.externalRunId,
            lastError: null,
            lastEventAt: args.createdAt,
            expiresAt: null,
            updatedAt: args.createdAt,
        });
    },
});

export const readRuntimeBinding = internalQuery({
    args: {
        userId: v.id("users"),
        agentId: v.string(),
        conversationLocalId: v.string(),
    },
    handler: async (ctx, args) => {
        const chat = await getChatByConversationIdForQuery(ctx, {
            userId: args.userId,
            agentId: args.agentId,
            conversationLocalId: args.conversationLocalId,
        });
        if (!chat) {
            return null;
        }

        const binding = await getRuntimeBindingByChatIdForQuery(ctx, chat._id);
        if (!binding) {
            return null;
        }

        return {
            provider: binding.provider,
            status: binding.status,
            providerThreadId: binding.providerThreadId,
            providerResumeToken: binding.providerResumeToken,
            activeRunId: binding.activeRunId,
            lastError: binding.lastError,
            lastEventAt: binding.lastEventAt,
            expiresAt: binding.expiresAt,
            workspaceMode: binding.workspaceMode,
            workspaceRootPath: binding.workspaceRootPath,
            workspaceCwd: binding.workspaceCwd,
            updatedAt: binding.updatedAt,
        };
    },
});

export const messageDelta = internalMutation({
    args: {
        userId: v.id("users"),
        agentId: v.string(),
        conversationLocalId: v.string(),
        assistantMessageLocalId: v.string(),
        externalRunId: v.string(),
        sequence: v.number(),
        content: v.string(),
        delta: v.string(),
        kind: v.optional(
            v.union(
                v.literal("assistant_message"),
                v.literal("assistant_status"),
            ),
        ),
        runMessageIndex: v.optional(v.number()),
        createdAt: v.number(),
    },
    handler: async (ctx, args) => {
        const chat = await getChatByConversationId(ctx, {
            userId: args.userId,
            agentId: args.agentId,
            conversationLocalId: args.conversationLocalId,
        });
        const run = await getRunByExternalId(ctx, args.externalRunId);
        if (!run) {
            throw new Error("Run not found");
        }

        // Guard: if the run already reached a terminal state (e.g. runCompleted
        // raced ahead of this delta), skip the mutation so we don't revert the
        // message to "streaming" or the runtime binding to "active".
        if (isTerminalRunStatus(run.status)) {
            return;
        }

        const assistantMessage = await updateAssistantMessage(ctx, {
            userId: args.userId,
            localId: args.assistantMessageLocalId,
            kind: args.kind,
            content: args.content,
            status: "streaming",
            runId: args.externalRunId,
            runMessageIndex: args.runMessageIndex,
            updatedAt: args.createdAt,
            completedAt: null,
        });

        await appendRunEvent(ctx, {
            runId: run._id,
            chatId: chat._id,
            userId: args.userId,
            sequence: args.sequence,
            kind: "message_delta",
            messageId: assistantMessage._id,
            textDelta: args.delta,
            createdAt: args.createdAt,
        });

        await upsertRuntimeBinding(ctx, {
            chatId: chat._id,
            userId: args.userId,
            provider: run.provider,
            status: "active",
            providerThreadId: run.providerThreadId,
            providerResumeToken: null,
            activeRunId: args.externalRunId,
            lastError: null,
            lastEventAt: args.createdAt,
            expiresAt: null,
            updatedAt: args.createdAt,
        });
    },
});

const terminalRunArgs = {
    userId: v.id("users"),
    agentId: v.string(),
    conversationLocalId: v.string(),
    assistantMessageLocalId: v.string(),
    externalRunId: v.string(),
    sequence: v.number(),
    content: v.string(),
    completedAt: v.number(),
};

async function finalizeRun(
    ctx: RuntimeMutationCtx,
    args: {
        userId: Id<"users">;
        agentId: string;
        conversationLocalId: string;
        assistantMessageLocalId: string;
        externalRunId: string;
        sequence: number;
        content: string;
        completedAt: number;
        runStatus: Exclude<RunStatus, "queued" | "starting" | "running">;
        messageStatus: Exclude<MessageStatus, "draft" | "streaming">;
        eventKind: Extract<
            RunEventKind,
            "run_completed" | "run_interrupted" | "run_failed"
        >;
        errorMessage: string | null;
    },
): Promise<void> {
    const chat = await getChatByConversationId(ctx, {
        userId: args.userId,
        agentId: args.agentId,
        conversationLocalId: args.conversationLocalId,
    });
    const run = await getRunByExternalId(ctx, args.externalRunId);
    if (!run) {
        throw new Error("Run not found");
    }

    const assistantMessage = await updateAssistantMessage(ctx, {
        userId: args.userId,
        localId: args.assistantMessageLocalId,
        content: args.content,
        status: args.messageStatus,
        runId: args.externalRunId,
        updatedAt: args.completedAt,
        completedAt: args.completedAt,
    });

    await ctx.db.patch(run._id, {
        status: args.runStatus,
        completedAt: args.completedAt,
        errorMessage: args.errorMessage,
    });

    await ctx.db.patch(chat._id, {
        updatedAt: Math.max(chat.updatedAt, args.completedAt),
    });

    await appendRunEvent(ctx, {
        runId: run._id,
        chatId: chat._id,
        userId: args.userId,
        sequence: args.sequence,
        kind: "message_completed",
        messageId: assistantMessage._id,
        createdAt: args.completedAt,
    });
    await appendRunEvent(ctx, {
        runId: run._id,
        chatId: chat._id,
        userId: args.userId,
        sequence: args.sequence + 1,
        kind: args.eventKind,
        messageId: assistantMessage._id,
        errorMessage: args.errorMessage,
        createdAt: args.completedAt,
    });

    await upsertRuntimeBinding(ctx, {
        chatId: chat._id,
        userId: args.userId,
        provider: run.provider,
        status: args.runStatus === "errored" ? "errored" : "idle",
        providerThreadId: run.providerThreadId,
        providerResumeToken: null,
        activeRunId: null,
        lastError: args.errorMessage,
        lastEventAt: args.completedAt,
        expiresAt: null,
        updatedAt: args.completedAt,
    });
}

async function getNextRunSequence(
    ctx: RuntimeMutationCtx,
    runId: Id<"runs">,
): Promise<number> {
    const latestEvent =
        (
            await ctx.db
                .query("run_events")
                .withIndex("by_runId_and_sequence", (q) => q.eq("runId", runId))
                .order("desc")
                .take(1)
        )[0] ?? null;

    return (latestEvent?.sequence ?? 0) + 1;
}

export const runCompleted = internalMutation({
    args: terminalRunArgs,
    handler: async (ctx, args) => {
        await finalizeRun(ctx, {
            ...args,
            runStatus: "completed",
            messageStatus: "completed",
            eventKind: "run_completed",
            errorMessage: null,
        });
    },
});

export const runInterrupted = internalMutation({
    args: terminalRunArgs,
    handler: async (ctx, args) => {
        await finalizeRun(ctx, {
            ...args,
            runStatus: "interrupted",
            messageStatus: "interrupted",
            eventKind: "run_interrupted",
            errorMessage: null,
        });
    },
});

export const runFailed = internalMutation({
    args: {
        ...terminalRunArgs,
        errorMessage: v.string(),
    },
    handler: async (ctx, args) => {
        await finalizeRun(ctx, {
            ...args,
            runStatus: "errored",
            messageStatus: "errored",
            eventKind: "run_failed",
            errorMessage: args.errorMessage,
        });
    },
});

export const recoverStaleRun = internalMutation({
    args: {
        userId: v.id("users"),
        agentId: v.string(),
        conversationLocalId: v.string(),
        externalRunId: v.string(),
        completedAt: v.number(),
        errorMessage: v.string(),
    },
    handler: async (ctx, args) => {
        const chat = await getChatByConversationId(ctx, {
            userId: args.userId,
            agentId: args.agentId,
            conversationLocalId: args.conversationLocalId,
        });
        const run = await getRunByExternalId(ctx, args.externalRunId);
        if (!run) {
            throw new Error("Run not found");
        }
        if (run.chatId !== chat._id) {
            throw new Error("Run does not belong to conversation");
        }
        if (isTerminalRunStatus(run.status)) {
            return;
        }

        const assistantMessage = run.outputMessageId
            ? await ctx.db.get(run.outputMessageId)
            : null;
        if (!assistantMessage) {
            throw new Error("Assistant message not found");
        }

        const sequence = await getNextRunSequence(ctx, run._id);
        await finalizeRun(ctx, {
            userId: args.userId,
            agentId: args.agentId,
            conversationLocalId: args.conversationLocalId,
            assistantMessageLocalId:
                assistantMessage.localId ?? assistantMessage._id,
            externalRunId: args.externalRunId,
            sequence,
            content: assistantMessage.content,
            completedAt: args.completedAt,
            runStatus: "errored",
            messageStatus: "errored",
            eventKind: "run_failed",
            errorMessage: args.errorMessage,
        });
    },
});

/**
 * Returns one page of chat agentId+userId+localId tuples. Used by the server
 * for sandbox workspace reconciliation (pruning orphaned directories).
 */
export const listAllChatLocalIds = internalQuery({
    args: {
        cursor: v.union(v.string(), v.null()),
    },
    handler: async (
        ctx,
        args,
    ): Promise<{
        entries: Array<{ agentId: string; userId: string; localId: string }>;
        continueCursor: string;
        isDone: boolean;
    }> => {
        const page = await ctx.db
            .query("chats")
            .paginate({ numItems: 1_000, cursor: args.cursor });

        const entries = page.page.map((chat) => ({
            agentId: chat.agentId,
            userId: chat.userId,
            localId: chat.localId ?? chat._id,
        }));

        return {
            entries,
            continueCursor: page.continueCursor,
            isDone: page.isDone,
        };
    },
});

/**
 * Returns whether a chat with the given localId exists for the user.
 * Used by the server to verify conversation.delete before removing sandboxes.
 */
export const chatExistsByLocalId = internalQuery({
    args: {
        userId: v.id("users"),
        agentId: v.string(),
        localId: v.string(),
    },
    handler: async (ctx, args): Promise<boolean> => {
        const chats = await ctx.db
            .query("chats")
            .withIndex("by_local_id", (q) =>
                q.eq("userId", args.userId).eq("localId", args.localId),
            )
            .collect();
        if (chats.some((chat) => chat.agentId === args.agentId)) {
            return true;
        }

        const legacyChats = await ctx.db
            .query("chats")
            .withIndex("by_user", (q) => q.eq("userId", args.userId))
            .collect();
        return legacyChats.some(
            (chat) =>
                chat.agentId === args.agentId &&
                (chat.localId ?? chat._id) === args.localId,
        );
    },
});

export const runtimeBinding = internalMutation({
    args: {
        userId: v.id("users"),
        agentId: v.string(),
        conversationLocalId: v.string(),
        provider: v.string(),
        status: runtimeStatusValidator,
        providerThreadId: v.union(v.string(), v.null()),
        providerResumeToken: v.union(v.string(), v.null()),
        activeRunId: v.union(v.string(), v.null()),
        lastError: v.union(v.string(), v.null()),
        lastEventAt: v.union(v.number(), v.null()),
        expiresAt: v.union(v.number(), v.null()),
        workspaceMode: v.optional(
            v.union(v.literal("shared"), v.literal("copy-on-conversation")),
        ),
        workspaceRootPath: v.optional(v.string()),
        workspaceCwd: v.optional(v.string()),
        updatedAt: v.number(),
    },
    handler: async (ctx, args) => {
        const chat = await findChatByConversationId(ctx, {
            userId: args.userId,
            agentId: args.agentId,
            conversationLocalId: args.conversationLocalId,
        });
        if (!chat) {
            return null;
        }

        await upsertRuntimeBinding(ctx, {
            chatId: chat._id,
            userId: args.userId,
            provider: args.provider,
            status: args.status,
            providerThreadId: args.providerThreadId,
            providerResumeToken: args.providerResumeToken,
            activeRunId: args.activeRunId,
            lastError: args.lastError,
            lastEventAt: args.lastEventAt,
            expiresAt: args.expiresAt,
            workspaceMode: args.workspaceMode,
            workspaceRootPath: args.workspaceRootPath,
            workspaceCwd: args.workspaceCwd,
            updatedAt: args.updatedAt,
        });

        return null;
    },
});
