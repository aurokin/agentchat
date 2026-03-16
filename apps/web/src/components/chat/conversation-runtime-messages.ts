import type {
    ActiveRunState,
    SocketEventResolution,
    StreamingMessageState,
} from "./conversation-runtime-controller";
import type { Message } from "@/lib/types";

export type ConversationMessageLifecyclePlan =
    | {
          type: "ignore";
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
          type: "message.updated";
          activeRun: ActiveRunState;
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

export function planConversationMessageLifecycleResolution(
    resolution: SocketEventResolution,
): ConversationMessageLifecyclePlan {
    if (resolution.type === "message.started") {
        return {
            type: "message.started",
            activeRun: resolution.activeRun,
            insertedMessage: resolution.message,
            previousMessagePatch: resolution.previousMessagePatch,
            streamingMessage: resolution.streamingMessage,
        };
    }

    if (resolution.type === "message.updated") {
        return {
            type: "message.updated",
            activeRun: resolution.activeRun,
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
