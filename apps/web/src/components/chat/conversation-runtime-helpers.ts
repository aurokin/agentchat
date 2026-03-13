import type {
    ChatSession,
    ConversationRuntimeState,
    Message,
} from "@/lib/types";
import {
    applyStreamingMessageOverlay,
    createRecoveredActiveRunFromSocket,
    type ActiveRunState,
    type RetryChatState,
    type RuntimeErrorState,
    type StreamingMessageState,
} from "@shared/core/conversation-runtime";

export { applyStreamingMessageOverlay, createRecoveredActiveRunFromSocket };
export type {
    ActiveRunState,
    RetryChatState,
    RuntimeErrorState,
    StreamingMessageState,
};

export function createRecoveredActiveRunFromRuntimeState(params: {
    currentChat: ChatSession;
    messages: Message[];
    runtimeState: ConversationRuntimeState;
}): ActiveRunState | null {
    if (
        params.runtimeState.phase !== "active" ||
        !params.runtimeState.assistantMessageId
    ) {
        return null;
    }

    const assistantMessage =
        params.messages.find(
            (message) => message.id === params.runtimeState.assistantMessageId,
        ) ?? null;
    if (!assistantMessage) {
        return null;
    }

    return {
        conversationId: params.currentChat.id,
        assistantMessageId: assistantMessage.id,
        userContent:
            (
                params.messages
                    .slice(
                        0,
                        params.messages.findIndex(
                            (message) => message.id === assistantMessage.id,
                        ),
                    )
                    .filter((message) => message.role === "user")
                    .at(-1) ?? params.messages.at(-1)
            )?.content ?? "",
        content: assistantMessage.content,
        runId: params.runtimeState.runId ?? assistantMessage.runId ?? null,
    };
}
