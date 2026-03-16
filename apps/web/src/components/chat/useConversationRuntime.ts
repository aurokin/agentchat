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
    type ProviderModel,
} from "@/lib/types";
import { trimTrailingEmptyLines } from "@shared/core/text";
import {
    applyStreamingMessageOverlay,
    type ActiveRunState,
    type RetryChatState,
    type RuntimeErrorState,
    type StreamingMessageState,
} from "./conversation-runtime-helpers";
import {
    connectConversationSocket,
    flushPendingConversationInterrupt,
    requestConversationInterrupt,
    resolveConversationRuntimeSync,
    resolveConversationSocketEvent,
    runConversationSend,
} from "./conversation-runtime-controller";
import { shouldClearPendingReconnectNoticeAfterSync } from "./conversation-runtime-sync";

type UseConversationRuntimeParams = {
    currentChat: ChatSession | null;
    messages: Message[];
    isMessagesLoading: boolean;
    runtimeState: ConversationRuntimeState;
    models: ProviderModel[];
    socketClient: AgentchatSocketClient;
    getBackendSessionToken: () => Promise<string>;
    addMessage: (message: {
        id?: string;
        role: string;
        content: string;
        contextContent: string;
        modelId?: string;
        reasoningEffort?: Message["reasoningEffort"];
        chatId?: string;
    }) => Promise<Message>;
    insertMessage: (message: Message) => void;
    updateMessage: (
        id: string,
        updates: Partial<
            Pick<Message, "content" | "contextContent" | "reasoning">
        >,
    ) => Promise<void>;
    patchMessage: (
        id: string,
        updates: Partial<
            Pick<
                Message,
                "content" | "contextContent" | "reasoning" | "status" | "kind"
            >
        >,
    ) => void;
    updateChat: (chat: ChatSession) => Promise<void>;
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
    insertMessage,
    updateMessage,
    patchMessage,
    updateChat,
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
    const pendingInterruptRef = useRef(false);
    const pendingReconnectNoticeRef = useRef(false);
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
        pendingInterruptRef.current = false;
        clearStreamingMessage();
        setRecoveredRunNotice(false);
        setSending(false);
    }, [clearStreamingMessage]);

    const handleSocketEvent = useCallback(
        (event: AgentchatSocketEvent) => {
            if (event.type === "connection.reconnected") {
                pendingReconnectNoticeRef.current = true;
                return;
            }

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
                const pendingInterruptError = flushPendingConversationInterrupt(
                    {
                        pendingInterrupt: pendingInterruptRef.current,
                        activeRun: resolution.activeRun,
                        sendCommand: (command) => socketClient.send(command),
                    },
                );
                pendingInterruptRef.current = false;
                if (pendingInterruptError) {
                    setError(pendingInterruptError);
                }
                if (resolution.recovered) {
                    setSending(true);
                    setRecoveredRunNotice(pendingReconnectNoticeRef.current);
                    pendingReconnectNoticeRef.current = false;
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

            if (resolution.type === "message.started") {
                activeRunRef.current = resolution.activeRun;
                if (resolution.previousMessagePatch) {
                    patchMessage(resolution.previousMessagePatch.id, {
                        kind: resolution.previousMessagePatch.kind,
                    });
                }
                insertMessage(resolution.message);
                queueStreamingMessageUpdate(resolution.streamingMessage);
                return;
            }

            if (resolution.type === "message.completed") {
                activeRunRef.current = resolution.activeRun;
                patchMessage(resolution.messageId, {
                    content: resolution.finalContent,
                    contextContent: resolution.finalContent,
                    status: "completed",
                });
                if (
                    resolution.messageId ===
                    resolution.activeRun.assistantMessageId
                ) {
                    queueStreamingMessageUpdate({
                        id: resolution.messageId,
                        content: resolution.finalContent,
                    });
                }
                return;
            }

            if (
                resolution.type === "run.completed" ||
                resolution.type === "run.interrupted"
            ) {
                pendingInterruptRef.current = false;
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
                pendingInterruptRef.current = false;
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
            insertMessage,
            patchMessage,
            persistActiveAssistantMessage,
            queueStreamingMessageUpdate,
            socketClient,
        ],
    );

    useEffect(() => {
        const unsubscribe = socketClient.subscribe(handleSocketEvent);
        return unsubscribe;
    }, [handleSocketEvent, socketClient]);

    useEffect(() => {
        return (
            connectConversationSocket({
                currentChatId: currentChat?.id ?? null,
                dependencies: {
                    subscribeToConversation: (conversationId) =>
                        socketClient.subscribeToConversation(conversationId),
                    ensureConnected: () =>
                        socketClient.ensureConnected(getBackendSessionToken),
                    onConnectionError: (connectError) => {
                        console.error(
                            "Failed to connect Agentchat socket:",
                            connectError,
                        );
                    },
                },
            }) ?? undefined
        );
    }, [currentChat, getBackendSessionToken, socketClient]);

    useEffect(() => {
        const syncResolution = resolveConversationRuntimeSync({
            currentChat,
            isMessagesLoading,
            messages,
            runtimeState,
            activeRun: activeRunRef.current,
        });
        const shouldClearPendingReconnectNotice =
            shouldClearPendingReconnectNoticeAfterSync({
                syncResolution,
                runtimeState,
            });

        if (syncResolution.shouldReset) {
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

        if (!syncResolution.recoveredRun) {
            if (shouldClearPendingReconnectNotice) {
                pendingReconnectNoticeRef.current = false;
            }
            return;
        }

        const recoveredRun = syncResolution.recoveredRun;
        activeRunRef.current = recoveredRun;
        queueMicrotask(() => {
            setSending(true);
            setRecoveredRunNotice(pendingReconnectNoticeRef.current);
            if (shouldClearPendingReconnectNotice) {
                pendingReconnectNoticeRef.current = false;
            }
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
            pendingInterruptRef.current = false;
            clearStreamingMessage();

            let assistantMessageId: string | null = null;

            const result = await runConversationSend({
                chat: chatSnapshot,
                messages: messagesSnapshot,
                models,
                content,
                dependencies: {
                    addMessage,
                    updateChat,
                    updateMessage,
                    queueStreamingMessageUpdate,
                    ensureConnected: () =>
                        socketClient.ensureConnected(getBackendSessionToken),
                    sendCommand: (command) => socketClient.send(command),
                },
            });

            if (result.status === "sent") {
                activeRunRef.current = result.activeRun;
                return;
            }

            assistantMessageId = result.assistantMessageId;
            activeRunRef.current = null;
            setSending(false);
            clearStreamingMessage();
            setError(result.error);
            setRetryChat(result.retryChat);
        },
        [
            addMessage,
            clearStreamingMessage,
            currentChat,
            getBackendSessionToken,
            messages,
            models,
            queueStreamingMessageUpdate,
            socketClient,
            updateChat,
            updateMessage,
        ],
    );

    const handleCancel = useCallback(() => {
        const result = requestConversationInterrupt({
            activeRun: activeRunRef.current,
            isSending: sending,
            queuePendingInterrupt: () => {
                pendingInterruptRef.current = true;
            },
            sendCommand: (command) => socketClient.send(command),
        });
        if (result.error) {
            setError(result.error);
        }
    }, [sending, socketClient]);

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
