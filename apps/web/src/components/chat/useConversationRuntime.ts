"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import type {
    AgentchatSocketClient,
    AgentchatSocketEvent,
} from "@/lib/agentchat-socket";
import {
    type ChatSession,
    type ConversationRuntimeState,
    type Message,
    type OpenRouterModel,
    type ThinkingLevel,
} from "@/lib/types";
import { trimTrailingEmptyLines } from "@shared/core/text";
import {
    applyStreamingMessageOverlay,
    createRecoveredActiveRunFromRuntimeState,
    type ActiveRunState,
    type RetryChatState,
    type RuntimeErrorState,
    type StreamingMessageState,
} from "./conversation-runtime-helpers";
import {
    buildInterruptCommand,
    prepareConversationSend,
    resolveConversationSocketEvent,
} from "./conversation-runtime-controller";

type UseConversationRuntimeParams = {
    currentChat: ChatSession | null;
    messages: Message[];
    isMessagesLoading: boolean;
    runtimeState: ConversationRuntimeState;
    models: OpenRouterModel[];
    socketClient: AgentchatSocketClient;
    getBackendSessionToken: () => Promise<string>;
    addMessage: (message: {
        id?: string;
        role: string;
        content: string;
        contextContent: string;
        modelId?: string;
        thinkingLevel?: ThinkingLevel;
        chatId?: string;
    }) => Promise<Message>;
    updateMessage: (
        id: string,
        updates: Partial<
            Pick<
                Message,
                "content" | "contextContent" | "thinking" | "attachmentIds"
            >
        >,
    ) => Promise<void>;
    updateChat: (chat: ChatSession) => Promise<void>;
    setDefaultModel: (modelId: string) => void;
    setDefaultThinking: (value: ThinkingLevel) => void;
};

type UseConversationRuntimeResult = {
    displayedMessages: Message[];
    sending: boolean;
    error: RuntimeErrorState | null;
    retryChat: RetryChatState | null;
    recoveredRunNotice: boolean;
    handleSendMessage: (content: string) => Promise<void>;
    handleCancel: () => void;
    handleRetry: () => Promise<void>;
};

export function useConversationRuntime({
    currentChat,
    messages,
    isMessagesLoading,
    runtimeState,
    models,
    socketClient,
    getBackendSessionToken,
    addMessage,
    updateMessage,
    updateChat,
    setDefaultModel,
    setDefaultThinking,
}: UseConversationRuntimeParams): UseConversationRuntimeResult {
    const [sending, setSending] = useState(false);
    const [error, setError] = useState<RuntimeErrorState | null>(null);
    const [retryChat, setRetryChat] = useState<RetryChatState | null>(null);
    const [streamingMessage, setStreamingMessage] =
        useState<StreamingMessageState | null>(null);
    const [recoveredRunNotice, setRecoveredRunNotice] = useState(false);
    const pendingStreamingUpdateRef = useRef<StreamingMessageState | null>(
        null,
    );
    const streamingFrameRef = useRef<number | null>(null);
    const activeRunRef = useRef<ActiveRunState | null>(null);
    const currentChatRef = useRef<ChatSession | null>(null);
    const messagesRef = useRef<Message[]>([]);

    const queueStreamingMessageUpdate = useCallback(
        (nextState: StreamingMessageState | null) => {
            pendingStreamingUpdateRef.current = nextState;

            if (typeof window === "undefined") {
                setStreamingMessage(nextState);
                return;
            }

            if (streamingFrameRef.current !== null) {
                return;
            }

            streamingFrameRef.current = window.requestAnimationFrame(() => {
                streamingFrameRef.current = null;
                setStreamingMessage(pendingStreamingUpdateRef.current);
            });
        },
        [],
    );

    const clearStreamingMessage = useCallback(() => {
        pendingStreamingUpdateRef.current = null;
        if (streamingFrameRef.current !== null) {
            window.cancelAnimationFrame(streamingFrameRef.current);
            streamingFrameRef.current = null;
        }
        setStreamingMessage(null);
    }, []);

    useEffect(() => {
        return () => {
            if (streamingFrameRef.current !== null) {
                window.cancelAnimationFrame(streamingFrameRef.current);
            }
        };
    }, []);

    useEffect(() => {
        currentChatRef.current = currentChat;
    }, [currentChat]);

    useEffect(() => {
        messagesRef.current = messages;
    }, [messages]);

    const persistActiveAssistantMessage = useCallback(
        async (contentOverride?: string) => {
            const activeRun = activeRunRef.current;
            if (!activeRun) {
                return;
            }

            const finalContent =
                trimTrailingEmptyLines(contentOverride ?? activeRun.content) ??
                "";
            await updateMessage(activeRun.assistantMessageId, {
                content: finalContent,
                contextContent: finalContent,
            });
        },
        [updateMessage],
    );

    const clearActiveRun = useCallback(() => {
        activeRunRef.current = null;
        clearStreamingMessage();
        setRecoveredRunNotice(false);
        setSending(false);
    }, [clearStreamingMessage]);

    const handleSocketEvent = useCallback(
        (event: AgentchatSocketEvent) => {
            const resolution = resolveConversationSocketEvent({
                currentChatId: currentChatRef.current?.id ?? null,
                event,
                activeRun: activeRunRef.current,
                messages: messagesRef.current,
            });

            if (resolution.type === "ignore") {
                return;
            }

            if (resolution.type === "run.started") {
                activeRunRef.current = resolution.activeRun;
                if (resolution.recovered) {
                    setSending(true);
                    setRecoveredRunNotice(true);
                    if (resolution.streamingMessage) {
                        queueStreamingMessageUpdate(
                            resolution.streamingMessage,
                        );
                    }
                }
                return;
            }

            if (resolution.type === "message.updated") {
                activeRunRef.current = resolution.activeRun;
                queueStreamingMessageUpdate(resolution.streamingMessage);
                return;
            }

            if (
                resolution.type === "run.completed" ||
                resolution.type === "run.interrupted"
            ) {
                activeRunRef.current = resolution.activeRun;
                void persistActiveAssistantMessage(
                    resolution.finalContent,
                ).finally(() => {
                    clearActiveRun();
                });
                return;
            }

            if (
                resolution.type === "run.failed" ||
                resolution.type === "connection.error"
            ) {
                activeRunRef.current = resolution.activeRun;
                void persistActiveAssistantMessage(
                    resolution.finalContent,
                ).finally(() => {
                    setError(resolution.error);
                    setRetryChat(resolution.retryChat);
                    clearActiveRun();
                });
            }
        },
        [
            clearActiveRun,
            persistActiveAssistantMessage,
            queueStreamingMessageUpdate,
        ],
    );

    useEffect(() => {
        const unsubscribe = socketClient.subscribe(handleSocketEvent);
        return unsubscribe;
    }, [handleSocketEvent, socketClient]);

    useEffect(() => {
        if (!currentChat) {
            return;
        }

        const unsubscribeConversation = socketClient.subscribeToConversation(
            currentChat.id,
        );

        void socketClient
            .ensureConnected(getBackendSessionToken)
            .catch((connectError) => {
                console.error(
                    "Failed to connect Agentchat socket:",
                    connectError,
                );
            });

        return unsubscribeConversation;
    }, [currentChat, getBackendSessionToken, socketClient]);

    useEffect(() => {
        if (!currentChat || isMessagesLoading) {
            return;
        }

        const existing = activeRunRef.current;
        if (existing && existing.conversationId !== currentChat.id) {
            activeRunRef.current = null;
            pendingStreamingUpdateRef.current = null;
            if (streamingFrameRef.current !== null) {
                window.cancelAnimationFrame(streamingFrameRef.current);
                streamingFrameRef.current = null;
            }
            queueMicrotask(() => {
                setStreamingMessage(null);
                setRecoveredRunNotice(false);
                setSending(false);
            });
        }

        if (activeRunRef.current) {
            return;
        }

        const recoveredRun = createRecoveredActiveRunFromRuntimeState({
            currentChat,
            messages,
            runtimeState,
        });
        if (!recoveredRun) {
            return;
        }

        activeRunRef.current = recoveredRun;
        queueMicrotask(() => {
            setSending(true);
            setRecoveredRunNotice(true);
            queueStreamingMessageUpdate({
                id: recoveredRun.assistantMessageId,
                content: recoveredRun.content,
            });
        });
    }, [
        currentChat,
        isMessagesLoading,
        messages,
        runtimeState,
        queueStreamingMessageUpdate,
    ]);

    const handleSendMessage = useCallback(
        async (content: string) => {
            const chatSnapshot = currentChat;
            const messagesSnapshot = messages;

            if (!chatSnapshot) {
                setError({ message: "No chat selected", isRetryable: false });
                return;
            }

            setSending(true);
            setError(null);
            setRetryChat(null);
            setRecoveredRunNotice(false);
            clearStreamingMessage();

            let assistantMessageId: string | null = null;

            try {
                const sendPlan = prepareConversationSend({
                    chat: chatSnapshot,
                    messages: messagesSnapshot,
                    models,
                    content,
                });
                assistantMessageId = sendPlan.assistantMessage.id;

                await addMessage(sendPlan.userMessage);
                setDefaultModel(chatSnapshot.modelId);
                if (sendPlan.shouldPersistDefaultThinking) {
                    setDefaultThinking(sendPlan.effectiveThinking);
                }

                if (sendPlan.titleUpdate) {
                    await updateChat(sendPlan.titleUpdate);
                }

                await addMessage(sendPlan.assistantMessage);
                queueStreamingMessageUpdate({
                    id: sendPlan.assistantMessage.id,
                    content: "",
                    thinking: undefined,
                });
                activeRunRef.current = sendPlan.activeRun;

                await socketClient.ensureConnected(getBackendSessionToken);
                socketClient.send(sendPlan.command);
            } catch (sendError) {
                activeRunRef.current = null;
                setSending(false);
                clearStreamingMessage();
                if (assistantMessageId) {
                    try {
                        await updateMessage(assistantMessageId, {
                            content: "",
                            contextContent: "",
                        });
                    } catch {
                        // Preserve the original error surfaced below.
                    }
                }

                setError({
                    message:
                        sendError instanceof Error
                            ? sendError.message
                            : "Failed to send message",
                    isRetryable: true,
                });
                setRetryChat({
                    content,
                    contextContent: content,
                });
            }
        },
        [
            addMessage,
            clearStreamingMessage,
            currentChat,
            getBackendSessionToken,
            messages,
            models,
            queueStreamingMessageUpdate,
            setDefaultModel,
            setDefaultThinking,
            socketClient,
            updateChat,
            updateMessage,
        ],
    );

    const handleCancel = useCallback(() => {
        const activeRun = activeRunRef.current;
        if (!activeRun) {
            return;
        }

        try {
            socketClient.send(buildInterruptCommand(activeRun.conversationId));
        } catch (cancelError) {
            setError({
                message:
                    cancelError instanceof Error
                        ? cancelError.message
                        : "Failed to interrupt the active run",
                isRetryable: true,
            });
        }
    }, [socketClient]);

    const handleRetry = useCallback(async () => {
        if (!retryChat || !currentChat) {
            return;
        }

        const { content } = retryChat;
        setRetryChat(null);
        setError(null);
        await handleSendMessage(content);
    }, [currentChat, handleSendMessage, retryChat]);

    const displayedMessages = useMemo(
        () => applyStreamingMessageOverlay(messages, streamingMessage),
        [messages, streamingMessage],
    );

    return {
        displayedMessages,
        sending,
        error,
        retryChat,
        recoveredRunNotice,
        handleSendMessage,
        handleCancel,
        handleRetry,
    };
}
