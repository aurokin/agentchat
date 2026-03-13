import { v } from "convex/values";
import { query } from "./_generated/server";
import { isOwner } from "./lib/authz";
import { requireCloudSync } from "./lib/subscription";

const MAX_RUNS_PER_CHAT = 10;

type RunSummary = {
    externalId: string;
    provider: string;
    status:
        | "queued"
        | "starting"
        | "running"
        | "completed"
        | "interrupted"
        | "errored";
    errorMessage: string | null;
    startedAt: number;
    completedAt: number | null;
    outputMessageLocalId: string | null;
    latestEventKind:
        | "run_started"
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

export const listByChat = query({
    args: {
        chatId: v.id("chats"),
    },
    handler: async (ctx, args) => {
        const authenticatedUserId = await requireCloudSync(ctx);
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
