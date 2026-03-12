import type {
    ChatSession,
    ConversationRuntimeState,
    Message,
} from "@/lib/types";

export interface RuntimeErrorState {
    message: string;
    isRetryable: boolean;
}

export interface RetryChatState {
    content: string;
    contextContent: string;
}

export interface StreamingMessageState {
    id: string;
    content: string;
    thinking?: string;
}

export interface ActiveRunState {
    conversationId: string;
    assistantMessageId: string;
    userContent: string;
    content: string;
    runId: string | null;
}

function findLatestUserContentBeforeMessage(
    messages: Message[],
    messageId: string,
): string {
    const assistantMessageIndex = messages.findIndex(
        (message) => message.id === messageId,
    );
    return (
        (
            messages
                .slice(
                    0,
                    assistantMessageIndex >= 0
                        ? assistantMessageIndex
                        : undefined,
                )
                .filter((message) => message.role === "user")
                .at(-1) ?? messages.at(-1)
        )?.content ?? ""
    );
}

export function createRecoveredActiveRunFromSocket(params: {
    conversationId: string;
    messageId: string;
    runId: string;
    messages: Message[];
}): ActiveRunState | null {
    const assistantMessage = params.messages.find(
        (message) => message.id === params.messageId,
    );
    if (!assistantMessage) {
        return null;
    }

    return {
        conversationId: params.conversationId,
        assistantMessageId: params.messageId,
        userContent: findLatestUserContentBeforeMessage(
            params.messages,
            params.messageId,
        ),
        content: assistantMessage.content,
        runId: params.runId,
    };
}

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
        userContent: findLatestUserContentBeforeMessage(
            params.messages,
            assistantMessage.id,
        ),
        content: assistantMessage.content,
        runId: params.runtimeState.runId ?? assistantMessage.runId ?? null,
    };
}

export function applyStreamingMessageOverlay(
    messages: Message[],
    streamingMessage: StreamingMessageState | null,
): Message[] {
    if (!streamingMessage) {
        return messages;
    }

    return messages.map((message) =>
        message.id === streamingMessage.id
            ? {
                  ...message,
                  content: streamingMessage.content,
                  contextContent: streamingMessage.content,
                  thinking: streamingMessage.thinking,
              }
            : message,
    );
}
