import {
    type AgentchatSocketEvent,
    type ConversationInterruptCommand,
    type ConversationSendCommand,
} from "./agentchat-socket";
import {
    modelSupportsReasoning,
    resolveReasoningEffortForVariant,
    type ProviderModel,
} from "./models";
import type { ChatSession, Message, ReasoningEffort } from "./types";

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
    reasoning?: string;
}

export interface ActiveRunState {
    conversationId: string;
    assistantMessageId: string;
    userContent: string;
    content: string;
    runId: string | null;
}

export interface ConversationRuntimeSnapshot {
    phase: "idle" | "active" | "recovering" | "interrupted" | "failed";
    runId: string | null;
    assistantMessageId: string | null;
}

export interface ConversationMessageDraft {
    id: string;
    role: "user" | "assistant";
    content: string;
    contextContent: string;
    modelId: string;
    variantId?: string | null;
    reasoningEffort: ReasoningEffort;
    chatId: string;
}

export interface PreparedConversationSend {
    userMessage: ConversationMessageDraft;
    assistantMessage: ConversationMessageDraft;
    command: ConversationSendCommand;
    titleUpdate: ChatSession | null;
    effectiveReasoningEffort: ReasoningEffort;
    activeRun: ActiveRunState;
}

type RuntimeIdFactory = () => string;

function generateId(): string {
    if (
        typeof crypto !== "undefined" &&
        typeof crypto.randomUUID === "function"
    ) {
        return crypto.randomUUID();
    }

    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
        /[xy]/g,
        (character) => {
            const random = Math.floor(Math.random() * 16);
            const value = character === "x" ? random : (random & 0x3) | 0x8;
            return value.toString(16);
        },
    );
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
    models: ProviderModel[];
    content: string;
    createId?: RuntimeIdFactory;
}): PreparedConversationSend {
    const createId = params.createId ?? generateId;
    const currentModel = params.models.find(
        (model) => model.id === params.chat.modelId,
    );
    const supportsReasoning = modelSupportsReasoning(currentModel);
    const effectiveReasoningEffort = supportsReasoning
        ? resolveReasoningEffortForVariant(params.chat.variantId)
        : "none";
    const userMessageId = createId();
    const assistantMessageId = createId();

    return {
        userMessage: {
            id: userMessageId,
            role: "user",
            content: params.content,
            contextContent: params.content,
            modelId: params.chat.modelId,
            variantId: params.chat.variantId ?? null,
            reasoningEffort: effectiveReasoningEffort,
            chatId: params.chat.id,
        },
        assistantMessage: {
            id: assistantMessageId,
            role: "assistant",
            content: "",
            contextContent: "",
            modelId: params.chat.modelId,
            variantId: params.chat.variantId ?? null,
            reasoningEffort: effectiveReasoningEffort,
            chatId: params.chat.id,
        },
        command: {
            id: createId(),
            type: "conversation.send",
            payload: {
                conversationId: params.chat.id,
                agentId: params.chat.agentId,
                modelId: params.chat.modelId,
                variantId: params.chat.variantId ?? null,
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
        effectiveReasoningEffort,
        activeRun: {
            conversationId: params.chat.id,
            assistantMessageId,
            userContent: params.content,
            content: "",
            runId: null,
        },
    };
}

export function isConversationRuntimeSnapshotLive(
    runtimeState: ConversationRuntimeSnapshot,
): boolean {
    return (
        runtimeState.phase === "active" || runtimeState.phase === "recovering"
    );
}

export function shouldResetActiveRunForRuntimeSnapshot(params: {
    currentConversationId: string;
    runtimeState: ConversationRuntimeSnapshot;
    activeRun: ActiveRunState | null;
}): boolean {
    if (!params.activeRun) {
        return false;
    }

    if (params.activeRun.conversationId !== params.currentConversationId) {
        return true;
    }

    if (!isConversationRuntimeSnapshotLive(params.runtimeState)) {
        return true;
    }

    if (
        params.runtimeState.assistantMessageId &&
        params.runtimeState.assistantMessageId !==
            params.activeRun.assistantMessageId
    ) {
        return true;
    }

    if (
        params.runtimeState.runId &&
        params.activeRun.runId &&
        params.runtimeState.runId !== params.activeRun.runId
    ) {
        return true;
    }

    return false;
}

export function synchronizeActiveRunWithRuntimeSnapshot(params: {
    currentConversationId: string;
    runtimeState: ConversationRuntimeSnapshot;
    activeRun: ActiveRunState | null;
}): ActiveRunState | null {
    if (!params.activeRun) {
        return null;
    }

    if (params.activeRun.conversationId !== params.currentConversationId) {
        return null;
    }

    if (!isConversationRuntimeSnapshotLive(params.runtimeState)) {
        return null;
    }

    if (
        !params.runtimeState.assistantMessageId ||
        params.runtimeState.assistantMessageId !==
            params.activeRun.assistantMessageId
    ) {
        return null;
    }

    if (!params.activeRun.runId && params.runtimeState.runId) {
        return {
            ...params.activeRun,
            runId: params.runtimeState.runId,
        };
    }

    return null;
}

export function buildInterruptCommand(
    conversationId: string,
    createId: RuntimeIdFactory = generateId,
): ConversationInterruptCommand {
    return {
        id: createId(),
        type: "conversation.interrupt",
        payload: {
            conversationId,
        },
    };
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
    conversationId: string;
    messages: Message[];
    runtimeState: ConversationRuntimeSnapshot;
}): ActiveRunState | null {
    if (
        !isConversationRuntimeSnapshotLive(params.runtimeState) ||
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
        conversationId: params.conversationId,
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
                  reasoning: streamingMessage.reasoning,
              }
            : message,
    );
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
          type: "message.started";
          activeRun: ActiveRunState;
          message: Message;
          streamingMessage: StreamingMessageState;
          previousMessagePatch: {
              id: string;
              kind: "assistant_message" | "assistant_status";
          } | null;
      }
    | {
          type: "message.updated";
          activeRun: ActiveRunState;
          streamingMessage: StreamingMessageState;
      }
    | {
          type: "message.completed";
          activeRun: ActiveRunState;
          messageId: string;
          finalContent: string;
      }
    | {
          type: "run.completed" | "run.interrupted";
          activeRun: ActiveRunState;
          finalContent: string;
      }
    | {
          type: "run.failed";
          activeRun: ActiveRunState;
          finalContent: string;
          error: RuntimeErrorState;
          retryChat: RetryChatState;
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

    if (params.event.type === "message.started") {
        const event = params.event as Extract<
            AgentchatSocketEvent,
            { type: "message.started" }
        >;
        const existingMessage =
            params.messages.find(
                (message) => message.id === event.payload.messageId,
            ) ?? null;
        const nextMessage: Message = existingMessage
            ? {
                  ...existingMessage,
                  kind: event.payload.kind,
                  content: event.payload.content,
                  contextContent: event.payload.content,
                  status: "streaming",
                  runId: event.payload.runId,
                  runMessageIndex: event.payload.messageIndex,
              }
            : {
                  id: event.payload.messageId,
                  sessionId: event.payload.conversationId,
                  role: "assistant",
                  kind: event.payload.kind,
                  content: event.payload.content,
                  contextContent: event.payload.content,
                  status: "streaming",
                  runId: event.payload.runId,
                  runMessageIndex: event.payload.messageIndex,
                  createdAt: Date.now(),
              };
        const nextActiveRun: ActiveRunState = {
            conversationId: event.payload.conversationId,
            assistantMessageId: event.payload.messageId,
            userContent:
                params.activeRun?.userContent ??
                findLatestUserContentBeforeMessage(
                    params.messages,
                    event.payload.messageId,
                ),
            content: event.payload.content,
            runId: event.payload.runId,
        };

        return {
            type: "message.started",
            activeRun: nextActiveRun,
            message: nextMessage,
            streamingMessage: {
                id: nextMessage.id,
                content: nextMessage.content,
            },
            previousMessagePatch:
                event.payload.previousMessageId && event.payload.previousKind
                    ? {
                          id: event.payload.previousMessageId,
                          kind: event.payload.previousKind,
                      }
                    : null,
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

    if (params.event.type === "message.delta") {
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

    if (params.event.type === "message.completed") {
        return {
            type: "message.completed",
            activeRun:
                params.event.payload.messageId ===
                params.activeRun.assistantMessageId
                    ? {
                          ...params.activeRun,
                          content: params.event.payload.content,
                      }
                    : params.activeRun,
            messageId: params.event.payload.messageId,
            finalContent: params.event.payload.content,
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

    if (params.event.type === "run.failed") {
        return {
            type: "run.failed",
            activeRun: params.activeRun,
            finalContent: params.activeRun.content,
            error: {
                message: params.event.payload.error.message,
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
