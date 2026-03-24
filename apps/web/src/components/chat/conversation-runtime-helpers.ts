import type {
    ChatSession,
    ConversationRuntimeState,
    Message,
} from "@/lib/types";
import {
    applyStreamingMessageOverlay,
    createRecoveredActiveRunFromRuntimeState as createRecoveredActiveRunFromRuntimeStateBase,
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
    return createRecoveredActiveRunFromRuntimeStateBase({
        conversationId: params.currentChat.id,
        agentId: params.currentChat.agentId,
        messages: params.messages,
        runtimeState: params.runtimeState,
    });
}
