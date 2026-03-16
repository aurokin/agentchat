import type { AgentchatSocketEvent } from "@/lib/agentchat-socket";
import type {
    ActiveRunState,
    RetryChatState,
    RuntimeErrorState,
    StreamingMessageState,
    SocketEventResolution,
} from "@shared/core/conversation-runtime";
import type { Message } from "@shared/core/types";

export type MobileRunLifecyclePlan =
    | {
          type: "ignore";
      }
    | {
          type: "connection.error";
          error: RuntimeErrorState;
          retryPayload: RetryChatState;
          shouldClearRuntimeState: true;
      }
    | {
          type: "run.started";
          activeRun: ActiveRunState;
          shouldSetLoading: boolean;
          error: RuntimeErrorState | null;
          recoveredRunNotice: boolean | null;
          clearPendingReconnectNotice: boolean;
          streamingMessage: StreamingMessageState | null;
      }
    | {
          type: "terminal";
          persistMessage: {
              messageId: string;
              content: string;
              status: NonNullable<Message["status"]>;
              runId: string | null;
          };
          error: RuntimeErrorState | null;
          retryPayload: RetryChatState | null;
      };

export type MobileMessageLifecyclePlan =
    | {
          type: "ignore";
      }
    | {
          type: "message.updated";
          activeRun: ActiveRunState;
          streamingMessage: StreamingMessageState;
      }
    | {
          type: "message.started";
          activeRun: ActiveRunState;
          insertedMessage: Message;
          previousMessagePatch: {
              id: string;
              kind: "assistant_message" | "assistant_status";
          } | null;
          streamingMessage: StreamingMessageState;
      }
    | {
          type: "message.completed";
          activeRun: ActiveRunState;
          messagePatch: {
              id: string;
              content: string;
              contextContent: string;
              status: "completed";
          };
          streamingMessage: StreamingMessageState | null;
      };

export function planMobileConnectionError(params: {
    activeRun: ActiveRunState | null;
    event: Extract<AgentchatSocketEvent, { type: "connection.error" }>;
}): MobileRunLifecyclePlan {
    if (!params.activeRun) {
        return { type: "ignore" };
    }

    return {
        type: "connection.error",
        error: {
            message: params.event.payload.message,
            isRetryable: true,
        },
        retryPayload: {
            content: params.activeRun.userContent,
            contextContent: params.activeRun.userContent,
        },
        shouldClearRuntimeState: true,
    };
}

export function planMobileRunLifecycleResolution(params: {
    resolution: SocketEventResolution;
    pendingReconnectNotice: boolean;
    pendingInterruptError?: RuntimeErrorState | null;
}): MobileRunLifecyclePlan {
    if (params.resolution.type === "run.started") {
        return {
            type: "run.started",
            activeRun: params.resolution.activeRun,
            shouldSetLoading: true,
            error: params.pendingInterruptError ?? null,
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
            persistMessage: {
                messageId: params.resolution.activeRun.assistantMessageId,
                content: params.resolution.finalContent,
                status:
                    params.resolution.type === "run.completed"
                        ? "completed"
                        : "interrupted",
                runId: params.resolution.activeRun.runId,
            },
            error: null,
            retryPayload: null,
        };
    }

    if (params.resolution.type === "run.failed") {
        return {
            type: "terminal",
            persistMessage: {
                messageId: params.resolution.activeRun.assistantMessageId,
                content: params.resolution.finalContent,
                status: "errored",
                runId: params.resolution.activeRun.runId,
            },
            error: params.resolution.error,
            retryPayload: params.resolution.retryChat,
        };
    }

    return { type: "ignore" };
}

export function planMobileMessageLifecycleResolution(
    resolution: SocketEventResolution,
): MobileMessageLifecyclePlan {
    if (resolution.type === "message.updated") {
        return {
            type: "message.updated",
            activeRun: resolution.activeRun,
            streamingMessage: resolution.streamingMessage,
        };
    }

    if (resolution.type === "message.started") {
        return {
            type: "message.started",
            activeRun: resolution.activeRun,
            insertedMessage: resolution.message,
            previousMessagePatch: resolution.previousMessagePatch,
            streamingMessage: resolution.streamingMessage,
        };
    }

    if (resolution.type === "message.completed") {
        return {
            type: "message.completed",
            activeRun: resolution.activeRun,
            messagePatch: {
                id: resolution.messageId,
                content: resolution.finalContent,
                contextContent: resolution.finalContent,
                status: "completed",
            },
            streamingMessage:
                resolution.messageId === resolution.activeRun.assistantMessageId
                    ? {
                          id: resolution.messageId,
                          content: resolution.finalContent,
                      }
                    : null,
        };
    }

    return { type: "ignore" };
}
