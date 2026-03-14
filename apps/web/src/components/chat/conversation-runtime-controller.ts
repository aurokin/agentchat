import type {
    ConversationInterruptCommand,
    ConversationSendCommand,
    AgentchatSocketEvent,
} from "@/lib/agentchat-socket";
import {
    type ChatSession,
    type ConversationRuntimeState,
    type Message,
} from "@/lib/types";
import {
    buildInterruptCommand,
    getChatTitleUpdate,
    prepareConversationSend,
    resolveConversationSocketEvent,
    type ActiveRunState,
    type PreparedConversationSend,
    type RetryChatState,
    type RuntimeErrorState,
    type SocketEventResolution,
    type StreamingMessageState,
} from "@shared/core/conversation-runtime";
import type { ProviderModel } from "@shared/core/models";
import { createRecoveredActiveRunFromRuntimeState } from "./conversation-runtime-helpers";

export {
    buildInterruptCommand,
    getChatTitleUpdate,
    prepareConversationSend,
    resolveConversationSocketEvent,
};
export type {
    ActiveRunState,
    PreparedConversationSend,
    RetryChatState,
    RuntimeErrorState,
    SocketEventResolution,
    StreamingMessageState,
};

type MessageUpdate = Partial<
    Pick<Message, "content" | "contextContent" | "reasoning">
>;

export type ConversationSendRuntimeDependencies = {
    addMessage: (message: {
        id: string;
        role: "user" | "assistant";
        content: string;
        contextContent: string;
        modelId: string;
        reasoningEffort?: Message["reasoningEffort"];
        chatId: string;
    }) => Promise<Message>;
    updateChat: (chat: ChatSession) => Promise<void>;
    updateMessage: (id: string, updates: MessageUpdate) => Promise<void>;
    setDefaultModel: (modelId: string) => void;
    queueStreamingMessageUpdate: (
        update: StreamingMessageState | null,
    ) => void | Promise<void>;
    ensureConnected: () => Promise<void>;
    sendCommand: (command: ConversationSendCommand) => void;
};

export type ConversationSocketSessionDependencies = {
    subscribeToConversation: (conversationId: string) => () => void;
    ensureConnected: () => Promise<void>;
    onConnectionError?: (error: unknown) => void;
};

export type ConversationSendRuntimeResult =
    | {
          status: "sent";
          activeRun: ActiveRunState;
      }
    | {
          status: "failed";
          error: RuntimeErrorState;
          retryChat: RetryChatState;
          assistantMessageId: string | null;
      };

export function connectConversationSocket(params: {
    currentChatId: string | null;
    dependencies: ConversationSocketSessionDependencies;
}): (() => void) | null {
    if (!params.currentChatId) {
        return null;
    }

    const unsubscribe = params.dependencies.subscribeToConversation(
        params.currentChatId,
    );
    void params.dependencies.ensureConnected().catch((error) => {
        params.dependencies.onConnectionError?.(error);
    });

    return unsubscribe;
}

export async function runConversationSend(params: {
    chat: ChatSession;
    messages: Message[];
    models: ProviderModel[];
    content: string;
    dependencies: ConversationSendRuntimeDependencies;
}): Promise<ConversationSendRuntimeResult> {
    let assistantMessageId: string | null = null;

    try {
        const sendPlan = prepareConversationSend({
            chat: params.chat,
            messages: params.messages,
            models: params.models,
            content: params.content,
        });
        assistantMessageId = sendPlan.assistantMessage.id;

        await params.dependencies.addMessage(sendPlan.userMessage);
        params.dependencies.setDefaultModel(params.chat.modelId);

        if (sendPlan.titleUpdate) {
            await params.dependencies.updateChat(sendPlan.titleUpdate);
        }

        await params.dependencies.addMessage(sendPlan.assistantMessage);
        await params.dependencies.queueStreamingMessageUpdate({
            id: sendPlan.assistantMessage.id,
            content: "",
            reasoning: undefined,
        });
        await params.dependencies.ensureConnected();
        params.dependencies.sendCommand(sendPlan.command);

        return {
            status: "sent",
            activeRun: sendPlan.activeRun,
        };
    } catch (sendError) {
        if (assistantMessageId) {
            try {
                await params.dependencies.updateMessage(assistantMessageId, {
                    content: "",
                    contextContent: "",
                });
            } catch {
                // Preserve the original send error as the surfaced failure.
            }
        }

        return {
            status: "failed",
            assistantMessageId,
            error: {
                message:
                    sendError instanceof Error
                        ? sendError.message
                        : "Failed to send message",
                isRetryable: true,
            },
            retryChat: {
                content: params.content,
                contextContent: params.content,
            },
        };
    }
}

export function interruptConversationRun(params: {
    activeRun: ActiveRunState | null;
    sendCommand: (command: ConversationInterruptCommand) => void;
}): RuntimeErrorState | null {
    if (!params.activeRun) {
        return null;
    }

    try {
        params.sendCommand(
            buildInterruptCommand(params.activeRun.conversationId),
        );
        return null;
    } catch (cancelError) {
        return {
            message:
                cancelError instanceof Error
                    ? cancelError.message
                    : "Failed to interrupt the active run",
            isRetryable: true,
        };
    }
}

export type RequestConversationInterruptResult = {
    queued: boolean;
    error: RuntimeErrorState | null;
};

export function requestConversationInterrupt(params: {
    activeRun: ActiveRunState | null;
    isSending: boolean;
    queuePendingInterrupt: () => void;
    sendCommand: (command: ConversationInterruptCommand) => void;
}): RequestConversationInterruptResult {
    if (params.activeRun) {
        return {
            queued: false,
            error: interruptConversationRun({
                activeRun: params.activeRun,
                sendCommand: params.sendCommand,
            }),
        };
    }

    if (params.isSending) {
        params.queuePendingInterrupt();
        return {
            queued: true,
            error: null,
        };
    }

    return {
        queued: false,
        error: {
            message: "No active run is available to interrupt yet.",
            isRetryable: true,
        },
    };
}

export function flushPendingConversationInterrupt(params: {
    pendingInterrupt: boolean;
    activeRun: ActiveRunState | null;
    sendCommand: (command: ConversationInterruptCommand) => void;
}): RuntimeErrorState | null {
    if (!params.pendingInterrupt || !params.activeRun) {
        return null;
    }

    return interruptConversationRun({
        activeRun: params.activeRun,
        sendCommand: params.sendCommand,
    });
}

export type RuntimeSyncResolution = {
    shouldReset: boolean;
    recoveredRun: ActiveRunState | null;
};

export function resolveConversationRuntimeSync(params: {
    currentChat: ChatSession | null;
    isMessagesLoading: boolean;
    messages: Message[];
    runtimeState: ConversationRuntimeState;
    activeRun: ActiveRunState | null;
}): RuntimeSyncResolution {
    if (!params.currentChat || params.isMessagesLoading) {
        return {
            shouldReset: false,
            recoveredRun: null,
        };
    }

    const shouldReset =
        !!params.activeRun &&
        (params.activeRun.conversationId !== params.currentChat.id ||
            (params.runtimeState.phase !== "active" &&
                params.runtimeState.phase !== "recovering"));

    if (params.activeRun && !shouldReset) {
        return {
            shouldReset: false,
            recoveredRun: null,
        };
    }

    return {
        shouldReset,
        recoveredRun: createRecoveredActiveRunFromRuntimeState({
            currentChat: params.currentChat,
            messages: params.messages,
            runtimeState: params.runtimeState,
        }),
    };
}
