import type {
    ConversationInterruptCommand,
    ConversationSendCommand,
    AgentchatSocketEvent,
} from "@/lib/agentchat-socket";
import {
    modelSupportsReasoning,
    type ChatSession,
    type ConversationRuntimeState,
    type Message,
    type OpenRouterModel,
} from "@/lib/types";
import { generateUUID } from "@/lib/utils";
import {
    createRecoveredActiveRunFromRuntimeState,
    createRecoveredActiveRunFromSocket,
    type ActiveRunState,
    type RetryChatState,
    type RuntimeErrorState,
    type StreamingMessageState,
} from "./conversation-runtime-helpers";

export type ConversationMessageDraft = {
    id: string;
    role: "user" | "assistant";
    content: string;
    contextContent: string;
    modelId: string;
    thinkingLevel: ChatSession["thinking"];
    chatId: string;
};

export type PreparedConversationSend = {
    userMessage: ConversationMessageDraft;
    assistantMessage: ConversationMessageDraft;
    command: ConversationSendCommand;
    titleUpdate: ChatSession | null;
    effectiveThinking: ChatSession["thinking"];
    shouldPersistDefaultThinking: boolean;
    activeRun: ActiveRunState;
};

type RuntimeIdFactory = () => string;
type MessageUpdate = Partial<
    Pick<Message, "content" | "contextContent" | "thinking" | "attachmentIds">
>;

export type ConversationSendRuntimeDependencies = {
    addMessage: (message: ConversationMessageDraft) => Promise<Message>;
    updateChat: (chat: ChatSession) => Promise<void>;
    updateMessage: (id: string, updates: MessageUpdate) => Promise<void>;
    setDefaultModel: (modelId: string) => void;
    setDefaultThinking: (thinking: ChatSession["thinking"]) => void;
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

export function getChatTitleUpdate(
    chat: ChatSession | null,
    content: string,
    messageCount: number,
): ChatSession | null {
    if (!chat || chat.title !== "New Chat" || messageCount !== 0) {
        return null;
    }

    const title = content.slice(0, 50) + (content.length > 50 ? "..." : "");
    return { ...chat, title };
}

export function prepareConversationSend(params: {
    chat: ChatSession;
    messages: Message[];
    models: OpenRouterModel[];
    content: string;
    createId?: RuntimeIdFactory;
}): PreparedConversationSend {
    const createId = params.createId ?? generateUUID;
    const currentModel = params.models.find(
        (model) => model.id === params.chat.modelId,
    );
    const supportsReasoning = modelSupportsReasoning(currentModel);
    const effectiveThinking = supportsReasoning ? params.chat.thinking : "none";
    const userMessageId = createId();
    const assistantMessageId = createId();

    return {
        userMessage: {
            id: userMessageId,
            role: "user",
            content: params.content,
            contextContent: params.content,
            modelId: params.chat.modelId,
            thinkingLevel: effectiveThinking,
            chatId: params.chat.id,
        },
        assistantMessage: {
            id: assistantMessageId,
            role: "assistant",
            content: "",
            contextContent: "",
            modelId: params.chat.modelId,
            thinkingLevel: effectiveThinking,
            chatId: params.chat.id,
        },
        command: {
            id: createId(),
            type: "conversation.send",
            payload: {
                conversationId: params.chat.id,
                agentId: params.chat.agentId,
                modelId: params.chat.modelId,
                thinking: effectiveThinking,
                content: params.content,
                userMessageId,
                assistantMessageId,
                history: params.messages.map((message) => ({
                    role: message.role,
                    content: message.contextContent,
                })),
            },
        },
        titleUpdate: getChatTitleUpdate(
            params.chat,
            params.content,
            params.messages.length,
        ),
        effectiveThinking,
        shouldPersistDefaultThinking: supportsReasoning,
        activeRun: {
            conversationId: params.chat.id,
            assistantMessageId,
            userContent: params.content,
            content: "",
            runId: null,
        },
    };
}

export function buildInterruptCommand(
    conversationId: string,
    createId: RuntimeIdFactory = generateUUID,
): ConversationInterruptCommand {
    return {
        id: createId(),
        type: "conversation.interrupt",
        payload: {
            conversationId,
        },
    };
}

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
    models: OpenRouterModel[];
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
        if (sendPlan.shouldPersistDefaultThinking) {
            params.dependencies.setDefaultThinking(sendPlan.effectiveThinking);
        }

        if (sendPlan.titleUpdate) {
            await params.dependencies.updateChat(sendPlan.titleUpdate);
        }

        await params.dependencies.addMessage(sendPlan.assistantMessage);
        await params.dependencies.queueStreamingMessageUpdate({
            id: sendPlan.assistantMessage.id,
            content: "",
            thinking: undefined,
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

export type SocketEventResolution =
    | {
          type: "ignore";
      }
    | {
          type: "run.started";
          activeRun: ActiveRunState;
          recovered: boolean;
          streamingMessage: StreamingMessageState | null;
      }
    | {
          type: "message.updated";
          activeRun: ActiveRunState;
          streamingMessage: StreamingMessageState;
      }
    | {
          type: "run.completed" | "run.interrupted";
          activeRun: ActiveRunState;
          finalContent: string;
      }
    | {
          type: "run.failed" | "connection.error";
          activeRun: ActiveRunState;
          finalContent: string;
          error: RuntimeErrorState;
          retryChat: RetryChatState;
      };

export type RuntimeSyncResolution = {
    shouldReset: boolean;
    recoveredRun: ActiveRunState | null;
};

export function resolveConversationSocketEvent(params: {
    currentChatId: string | null;
    event: AgentchatSocketEvent;
    activeRun: ActiveRunState | null;
    messages: Message[];
}): SocketEventResolution {
    if (
        !params.currentChatId ||
        !("conversationId" in params.event.payload) ||
        params.event.payload.conversationId !== params.currentChatId
    ) {
        return { type: "ignore" };
    }

    if (params.event.type === "run.started") {
        if (!params.activeRun) {
            const recoveredRun = createRecoveredActiveRunFromSocket({
                conversationId: params.event.payload.conversationId,
                messageId: params.event.payload.messageId,
                runId: params.event.payload.runId,
                messages: params.messages,
            });
            if (!recoveredRun) {
                return { type: "ignore" };
            }

            return {
                type: "run.started",
                activeRun: recoveredRun,
                recovered: true,
                streamingMessage: recoveredRun.content
                    ? {
                          id: recoveredRun.assistantMessageId,
                          content: recoveredRun.content,
                      }
                    : null,
            };
        }

        return {
            type: "run.started",
            activeRun: {
                ...params.activeRun,
                runId: params.event.payload.runId,
            },
            recovered: false,
            streamingMessage: null,
        };
    }

    if (!params.activeRun) {
        return { type: "ignore" };
    }

    if (
        "runId" in params.event.payload &&
        params.activeRun.runId &&
        params.event.payload.runId !== params.activeRun.runId
    ) {
        return { type: "ignore" };
    }

    if (
        params.event.type === "message.delta" ||
        params.event.type === "message.completed"
    ) {
        const nextActiveRun = {
            ...params.activeRun,
            content: params.event.payload.content,
        };

        return {
            type: "message.updated",
            activeRun: nextActiveRun,
            streamingMessage: {
                id: nextActiveRun.assistantMessageId,
                content: params.event.payload.content,
            },
        };
    }

    if (
        params.event.type === "run.completed" ||
        params.event.type === "run.interrupted"
    ) {
        return {
            type: params.event.type,
            activeRun: params.activeRun,
            finalContent: params.activeRun.content,
        };
    }

    if (
        params.event.type === "run.failed" ||
        params.event.type === "connection.error"
    ) {
        const message =
            params.event.type === "run.failed"
                ? params.event.payload.error.message
                : params.event.payload.message;

        return {
            type: params.event.type,
            activeRun: params.activeRun,
            finalContent: params.activeRun.content,
            error: {
                message,
                isRetryable: true,
            },
            retryChat: {
                content: params.activeRun.userContent,
                contextContent: params.activeRun.userContent,
            },
        };
    }

    return { type: "ignore" };
}

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
        params.activeRun.conversationId !== params.currentChat.id;

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
