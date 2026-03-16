import type {
    ActiveRunState,
    RetryChatState,
    RuntimeErrorState,
    SocketEventResolution,
    StreamingMessageState,
} from "./conversation-runtime-controller";

export type ConversationRunLifecyclePlan =
    | {
          type: "ignore";
      }
    | {
          type: "run.started";
          activeRun: ActiveRunState;
          clearPendingInterrupt: boolean;
          error: RuntimeErrorState | null;
          shouldSetSending: boolean;
          recoveredRunNotice: boolean | null;
          clearPendingReconnectNotice: boolean;
          streamingMessage: StreamingMessageState | null;
      }
    | {
          type: "terminal";
          activeRun: ActiveRunState;
          clearPendingInterrupt: boolean;
          persistFinalContent: string;
          error: RuntimeErrorState | null;
          retryChat: RetryChatState | null;
      };

export function planConversationRunLifecycleResolution(params: {
    resolution: SocketEventResolution;
    pendingReconnectNotice: boolean;
    pendingInterruptError?: RuntimeErrorState | null;
}): ConversationRunLifecyclePlan {
    if (params.resolution.type === "run.started") {
        return {
            type: "run.started",
            activeRun: params.resolution.activeRun,
            clearPendingInterrupt: true,
            error: params.pendingInterruptError ?? null,
            shouldSetSending: params.resolution.recovered,
            recoveredRunNotice: params.resolution.recovered
                ? params.pendingReconnectNotice
                : null,
            clearPendingReconnectNotice: params.resolution.recovered,
            streamingMessage: params.resolution.recovered
                ? params.resolution.streamingMessage
                : null,
        };
    }

    if (
        params.resolution.type === "run.completed" ||
        params.resolution.type === "run.interrupted"
    ) {
        return {
            type: "terminal",
            activeRun: params.resolution.activeRun,
            clearPendingInterrupt: true,
            persistFinalContent: params.resolution.finalContent,
            error: null,
            retryChat: null,
        };
    }

    if (params.resolution.type === "run.failed") {
        return {
            type: "terminal",
            activeRun: params.resolution.activeRun,
            clearPendingInterrupt: true,
            persistFinalContent: params.resolution.finalContent,
            error: params.resolution.error,
            retryChat: params.resolution.retryChat,
        };
    }

    return { type: "ignore" };
}
