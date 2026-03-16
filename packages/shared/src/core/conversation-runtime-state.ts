import type { Message } from "./types";

export interface ChatRunSummaryLike {
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
    latestEventAt: number | null;
}

export interface RuntimeBindingSummaryLike {
    status: "idle" | "active" | "expired" | "errored";
    activeRunId: string | null;
    lastError: string | null;
    lastEventAt: number | null;
    updatedAt: number;
}

export interface ConversationRuntimeStateLike {
    phase: "idle" | "active" | "recovering" | "interrupted" | "failed";
    runId: string | null;
    assistantMessageId: string | null;
    provider: string | null;
    errorMessage: string | null;
    startedAt: number | null;
    completedAt: number | null;
    lastEventAt: number | null;
}

const IDLE_RUNTIME_STATE: ConversationRuntimeStateLike = {
    phase: "idle",
    runId: null,
    assistantMessageId: null,
    provider: null,
    errorMessage: null,
    startedAt: null,
    completedAt: null,
    lastEventAt: null,
};

export function deriveConversationRuntimeState(params: {
    messages: Message[];
    runSummaries: ChatRunSummaryLike[];
    runtimeBinding?: RuntimeBindingSummaryLike | null;
}): ConversationRuntimeStateLike {
    const latestRun = params.runSummaries[0] ?? null;
    if (!latestRun) {
        const streamingMessage =
            [...params.messages]
                .reverse()
                .find(
                    (message) =>
                        message.role === "assistant" &&
                        message.status === "streaming",
                ) ?? null;
        if (!streamingMessage) {
            return IDLE_RUNTIME_STATE;
        }

        return {
            phase: "active",
            runId: streamingMessage.runId ?? null,
            assistantMessageId: streamingMessage.id,
            provider: null,
            errorMessage: null,
            startedAt: streamingMessage.createdAt,
            completedAt: null,
            lastEventAt:
                streamingMessage.updatedAt ?? streamingMessage.createdAt,
        };
    }

    if (
        latestRun.status === "running" ||
        latestRun.status === "queued" ||
        latestRun.status === "starting"
    ) {
        if (params.runtimeBinding !== undefined) {
            if (
                !params.runtimeBinding ||
                params.runtimeBinding.status !== "active" ||
                params.runtimeBinding.activeRunId !== latestRun.externalId
            ) {
                if (params.runtimeBinding?.status === "errored") {
                    return {
                        phase: "failed",
                        runId: latestRun.externalId,
                        assistantMessageId: latestRun.outputMessageLocalId,
                        provider: latestRun.provider,
                        errorMessage:
                            params.runtimeBinding.lastError ??
                            latestRun.errorMessage,
                        startedAt: latestRun.startedAt,
                        completedAt:
                            latestRun.completedAt ??
                            params.runtimeBinding.updatedAt,
                        lastEventAt:
                            params.runtimeBinding.lastEventAt ??
                            latestRun.latestEventAt,
                    };
                }

                return IDLE_RUNTIME_STATE;
            }
        }

        return {
            phase: "active",
            runId: latestRun.externalId,
            assistantMessageId: latestRun.outputMessageLocalId,
            provider: latestRun.provider,
            errorMessage: null,
            startedAt: latestRun.startedAt,
            completedAt: latestRun.completedAt,
            lastEventAt: latestRun.latestEventAt,
        };
    }

    if (latestRun.status === "errored") {
        return {
            phase: "failed",
            runId: latestRun.externalId,
            assistantMessageId: latestRun.outputMessageLocalId,
            provider: latestRun.provider,
            errorMessage: latestRun.errorMessage,
            startedAt: latestRun.startedAt,
            completedAt: latestRun.completedAt,
            lastEventAt: latestRun.latestEventAt,
        };
    }

    if (latestRun.status === "interrupted") {
        return {
            phase: "interrupted",
            runId: latestRun.externalId,
            assistantMessageId: latestRun.outputMessageLocalId,
            provider: latestRun.provider,
            errorMessage: null,
            startedAt: latestRun.startedAt,
            completedAt: latestRun.completedAt,
            lastEventAt: latestRun.latestEventAt,
        };
    }

    return IDLE_RUNTIME_STATE;
}
