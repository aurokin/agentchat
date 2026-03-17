import { v } from "convex/values";
import { query } from "./_generated/server";
import { isOwner } from "./lib/authz";
import { requireWorkspaceUser } from "./lib/subscription";
import type { RunStatus } from "../../shared/src/core/types";

const MAX_RUNS_PER_CHAT = 10;
const MAX_RUN_EVENTS_PER_RUN = 200;

type RunSummary = {
    externalId: string;
    provider: string;
    status: RunStatus;
    errorMessage: string | null;
    startedAt: number;
    completedAt: number | null;
    outputMessageLocalId: string | null;
    latestEventKind:
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
        | "provider_status"
        | null;
    latestEventAt: number | null;
};

type RunEventSummary = {
    sequence: number;
    kind:
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
    textDelta: string | null;
    errorMessage: string | null;
    messageLocalId: string | null;
    createdAt: number;
};

export const listByChat = query({
    args: {
        chatId: v.id("chats"),
    },
    handler: async (ctx, args) => {
        const authenticatedUserId = await requireWorkspaceUser(ctx);
        const chat = await ctx.db.get(args.chatId);
        if (!isOwner(chat, authenticatedUserId)) {
            return [];
        }

        const runs = await ctx.db
            .query("runs")
            .withIndex("by_chatId_and_startedAt", (q) =>
                q.eq("chatId", args.chatId),
            )
            .order("desc")
            .take(MAX_RUNS_PER_CHAT);

        const summaries: RunSummary[] = [];
        for (const run of runs) {
            const latestEvent =
                (
                    await ctx.db
                        .query("run_events")
                        .withIndex("by_runId_and_sequence", (q) =>
                            q.eq("runId", run._id),
                        )
                        .order("desc")
                        .take(1)
                )[0] ?? null;
            const outputMessage = run.outputMessageId
                ? await ctx.db.get(run.outputMessageId)
                : null;

            summaries.push({
                externalId: run.externalId,
                provider: run.provider,
                status: run.status,
                errorMessage:
                    run.errorMessage ?? latestEvent?.errorMessage ?? null,
                startedAt: run.startedAt,
                completedAt: run.completedAt,
                outputMessageLocalId:
                    outputMessage?.localId ?? outputMessage?._id ?? null,
                latestEventKind: latestEvent?.kind ?? null,
                latestEventAt: latestEvent?.createdAt ?? null,
            });
        }

        return summaries;
    },
});

export const listEventsByExternalId = query({
    args: {
        externalId: v.string(),
    },
    handler: async (ctx, args) => {
        const authenticatedUserId = await requireWorkspaceUser(ctx);
        const run = await ctx.db
            .query("runs")
            .withIndex("by_externalId", (q) =>
                q.eq("externalId", args.externalId),
            )
            .unique();
        if (!run) {
            return [];
        }

        const chat = await ctx.db.get(run.chatId);
        if (!isOwner(chat, authenticatedUserId)) {
            return [];
        }

        const events = await ctx.db
            .query("run_events")
            .withIndex("by_runId_and_sequence", (q) => q.eq("runId", run._id))
            .order("asc")
            .take(MAX_RUN_EVENTS_PER_RUN);

        const summaries: RunEventSummary[] = [];
        for (const event of events) {
            const message = event.messageId
                ? await ctx.db.get(event.messageId)
                : null;
            summaries.push({
                sequence: event.sequence,
                kind: event.kind,
                textDelta: event.textDelta,
                errorMessage: event.errorMessage,
                messageLocalId: message?.localId ?? null,
                createdAt: event.createdAt,
            });
        }

        return summaries;
    },
});
