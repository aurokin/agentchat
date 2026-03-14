import type {
    ChatRunSummary,
    ConversationRuntimeState,
    Message,
    RuntimeBindingSummary,
} from "@/lib/types";

const IDLE_RUNTIME_STATE: ConversationRuntimeState = {
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
    runSummaries: ChatRunSummary[];
    runtimeBinding?: RuntimeBindingSummary | null;
}): ConversationRuntimeState {
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
