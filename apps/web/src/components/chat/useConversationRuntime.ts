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
import { getScopedChatStateKey } from "@/contexts/chat-state";
import { trimTrailingEmptyLines } from "@shared/core/text";
import {
    shouldApplyConversationScopedUpdate,
    shouldResetPendingConversationSendOnConversationChange,
} from "@shared/core/conversation-runtime";
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
import { planConversationRunLifecycleResolution } from "./conversation-runtime-events";
import { planConversationRuntimeSync } from "./conversation-runtime-hook";
import { planConversationMessageLifecycleResolution } from "./conversation-runtime-messages";

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
        variantId?: string | null;
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
    const pendingSendConversationRef = useRef<{
        conversationId: string;
        agentId: string;
    } | null>(null);
    const currentChatRef = useRef<ChatSession | null>(null);
    const previousConversationScopeRef = useRef<string | null>(null);
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
        const currentConversationScope =
            currentChat?.id && currentChat?.agentId
                ? getScopedChatStateKey(currentChat.id, currentChat.agentId)
                : null;
        if (
            previousConversationScopeRef.current !== null &&
            previousConversationScopeRef.current !== currentConversationScope
        ) {
            pendingInterruptRef.current = false;
            pendingReconnectNoticeRef.current = false;
            queueMicrotask(() => {
                setError(null);
                setRetryChat(null);
                setRecoveredRunNotice(false);
            });
        }

        previousConversationScopeRef.current = currentConversationScope;
    }, [currentChat?.agentId, currentChat?.id]);

    useEffect(() => {
        if (
            !shouldResetPendingConversationSendOnConversationChange({
                currentConversationId: currentChat?.id ?? null,
                currentAgentId: currentChat?.agentId ?? null,
                pendingSendConversationId:
                    pendingSendConversationRef.current?.conversationId ?? null,
                pendingSendAgentId:
                    pendingSendConversationRef.current?.agentId ?? null,
                activeRun: activeRunRef.current,
            })
        ) {
            return;
        }

        pendingSendConversationRef.current = null;
        queueMicrotask(() => {
            setSending(false);
        });
    }, [currentChat?.agentId, currentChat?.id]);

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
        pendingSendConversationRef.current = null;
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
                currentAgentId: currentChatRef.current?.agentId ?? null,
                event,
                activeRun: activeRunRef.current,
                messages: messagesRef.current,
            });

            if (resolution.type === "ignore") {
                return;
            }

            if (resolution.type === "run.started") {
                const pendingInterruptError = flushPendingConversationInterrupt(
                    {
                        pendingInterrupt: pendingInterruptRef.current,
                        activeRun: resolution.activeRun,
                        agentId: currentChatRef.current?.agentId ?? null,
                        sendCommand: (command) => socketClient.send(command),
                    },
                );
                const runLifecyclePlan = planConversationRunLifecycleResolution(
                    {
                        resolution,
                        pendingReconnectNotice:
                            pendingReconnectNoticeRef.current,
                        pendingInterruptError,
                    },
                );
                if (runLifecyclePlan.type !== "run.started") {
                    return;
                }

                activeRunRef.current = runLifecyclePlan.activeRun;
                pendingInterruptRef.current = false;
                if (runLifecyclePlan.error) {
                    setError(runLifecyclePlan.error);
                }
                if (runLifecyclePlan.shouldSetSending) {
                    setSending(true);
                    setRecoveredRunNotice(
                        runLifecyclePlan.recoveredRunNotice ?? false,
                    );
                    if (runLifecyclePlan.clearPendingReconnectNotice) {
                        pendingReconnectNoticeRef.current = false;
                    }
                    if (runLifecyclePlan.streamingMessage) {
                        queueStreamingMessageUpdate(
                            runLifecyclePlan.streamingMessage,
                        );
                    }
                }
                return;
            }

            if (resolution.type === "message.updated") {
                const messageLifecyclePlan =
                    planConversationMessageLifecycleResolution(resolution);
                if (messageLifecyclePlan.type !== "message.updated") {
                    return;
                }

                activeRunRef.current = messageLifecyclePlan.activeRun;
                queueStreamingMessageUpdate(
                    messageLifecyclePlan.streamingMessage,
                );
                return;
            }

            if (resolution.type === "message.started") {
                const messageLifecyclePlan =
                    planConversationMessageLifecycleResolution(resolution);
                if (messageLifecyclePlan.type !== "message.started") {
                    return;
                }

                activeRunRef.current = messageLifecyclePlan.activeRun;
                if (messageLifecyclePlan.previousMessagePatch) {
                    patchMessage(messageLifecyclePlan.previousMessagePatch.id, {
                        kind: messageLifecyclePlan.previousMessagePatch.kind,
                    });
                }
                insertMessage(messageLifecyclePlan.insertedMessage);
                queueStreamingMessageUpdate(
                    messageLifecyclePlan.streamingMessage,
                );
                return;
            }

            if (resolution.type === "message.completed") {
                const messageLifecyclePlan =
                    planConversationMessageLifecycleResolution(resolution);
                if (messageLifecyclePlan.type !== "message.completed") {
                    return;
                }

                activeRunRef.current = messageLifecyclePlan.activeRun;
                patchMessage(
                    messageLifecyclePlan.messagePatch.id,
                    messageLifecyclePlan.messagePatch,
                );
                if (messageLifecyclePlan.streamingMessage) {
                    queueStreamingMessageUpdate(
                        messageLifecyclePlan.streamingMessage,
                    );
                }
                return;
            }

            if (
                resolution.type === "run.completed" ||
                resolution.type === "run.interrupted"
            ) {
                const runLifecyclePlan = planConversationRunLifecycleResolution(
                    {
                        resolution,
                        pendingReconnectNotice:
                            pendingReconnectNoticeRef.current,
                    },
                );
                if (runLifecyclePlan.type !== "terminal") {
                    return;
                }
                pendingInterruptRef.current = false;
                activeRunRef.current = runLifecyclePlan.activeRun;
                void persistActiveAssistantMessage(
                    runLifecyclePlan.persistFinalContent,
                ).finally(() => {
                    clearActiveRun();
                });
                return;
            }

            if (resolution.type === "run.failed") {
                const runLifecyclePlan = planConversationRunLifecycleResolution(
                    {
                        resolution,
                        pendingReconnectNotice:
                            pendingReconnectNoticeRef.current,
                    },
                );
                if (runLifecyclePlan.type !== "terminal") {
                    return;
                }
                pendingInterruptRef.current = false;
                activeRunRef.current = runLifecyclePlan.activeRun;
                void persistActiveAssistantMessage(
                    runLifecyclePlan.persistFinalContent,
                ).finally(() => {
                    setError(runLifecyclePlan.error);
                    setRetryChat(runLifecyclePlan.retryChat);
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
        const currentConversationId = currentChat?.id ?? null;
        const currentAgentId = currentChat?.agentId ?? null;
        return (
            connectConversationSocket({
                currentChat:
                    currentConversationId && currentAgentId
                        ? {
                              id: currentConversationId,
                              agentId: currentAgentId,
                          }
                        : null,
                dependencies: {
                    subscribeToConversation: (conversationId, agentId) =>
                        socketClient.subscribeToConversation(
                            conversationId,
                            agentId,
                        ),
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
    }, [
        currentChat?.agentId,
        currentChat?.id,
        getBackendSessionToken,
        socketClient,
    ]);

    useEffect(() => {
        const syncPlan = planConversationRuntimeSync({
            syncResolution: resolveConversationRuntimeSync({
                currentChat,
                isMessagesLoading,
                messages,
                runtimeState,
                activeRun: activeRunRef.current,
            }),
            runtimeState,
            pendingReconnectNotice: pendingReconnectNoticeRef.current,
        });

        if (syncPlan.shouldReset) {
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

        if (!syncPlan.recoveredRun) {
            if (syncPlan.clearPendingReconnectNotice) {
                pendingReconnectNoticeRef.current = false;
            }
            return;
        }

        const recoveredRun = syncPlan.recoveredRun;
        activeRunRef.current = recoveredRun;
        queueMicrotask(() => {
            setSending(true);
            setRecoveredRunNotice(syncPlan.recoveredRunNotice ?? false);
            if (syncPlan.clearPendingReconnectNotice) {
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
            pendingSendConversationRef.current = {
                conversationId: chatSnapshot.id,
                agentId: chatSnapshot.agentId,
            };
            clearStreamingMessage();

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

            pendingSendConversationRef.current = null;
            if (
                !shouldApplyConversationScopedUpdate({
                    currentConversationId: currentChatRef.current?.id ?? null,
                    currentAgentId: currentChatRef.current?.agentId ?? null,
                    targetConversationId: chatSnapshot.id,
                    targetAgentId: chatSnapshot.agentId,
                })
            ) {
                return;
            }

            if (result.status === "sent") {
                activeRunRef.current = result.activeRun;
                return;
            }

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
            agentId: currentChatRef.current?.agentId ?? null,
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
