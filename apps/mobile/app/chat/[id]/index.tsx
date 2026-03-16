import React, {
    startTransition,
    useEffect,
    useState,
    useRef,
    useMemo,
    useCallback,
    type ReactElement,
} from "react";
import {
    View,
    Text,
    FlatList,
    TouchableOpacity,
    StyleSheet,
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    useWindowDimensions,
    type NativeScrollEvent,
    type NativeSyntheticEvent,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useChatContext } from "@/contexts/ChatContext";
import { useModelContext } from "@/contexts/ModelContext";
import { useTheme, type ThemeColors } from "@/contexts/ThemeContext";
import { useAgentchatSocket } from "@/contexts/AgentchatSocketContext";
import { useAgent } from "@/contexts/AgentContext";
import {
    modelSupportsReasoning,
    type ProviderModel,
} from "@shared/core/models";
import type { ChatSession, Message } from "@shared/core/types";
import { resolveChatSettingsAgainstModels } from "@shared/core/defaults";
import {
    applyStreamingMessageOverlay,
    createRecoveredActiveRunFromRuntimeState,
    resolveConversationSocketEvent,
    type ActiveRunState,
    type RetryChatState,
    type RuntimeErrorState,
    type StreamingMessageState,
} from "@shared/core/conversation-runtime";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { MessageInput } from "@/components/chat/MessageInput";
import { AgentSwitcher } from "@/components/chat/AgentSwitcher";
import { MarkdownRenderer } from "@/components/chat/MarkdownRenderer";
import { TopBar } from "@/components/ui/TopBar";
import { consumePendingSharePayload } from "@/lib/share-intent/pending-share";
import { resolveResponsiveLayout } from "@/lib/responsive-layout";
import {
    interruptMobileConversationRun,
    resolveMobileConversationRuntimeSync,
    runMobileConversationSend,
} from "@/components/chat/conversation-runtime-controller";

const EMPTY_MESSAGES: Message[] = [];

export default function ChatScreen(): ReactElement {
    const params = useLocalSearchParams();
    const router = useRouter();
    const chatId = params.id as string;
    const {
        chats,
        currentChat,
        messages,
        runtimeState,
        defaultModel,
        selectChat,
        addMessage,
        insertMessage,
        updateMessage,
        patchMessage,
        createChat,
        deleteChat,
        updateChat,
        loadChats,
    } = useChatContext();
    const {
        models,
        availableProviders,
        selectedProviderId,
        availableVariants,
        selectedVariantId,
        selectProvider,
        selectModel: setSelectedModel,
        selectVariant: setSelectedVariant,
        syncSelectionFromChat,
        favoriteModels,
        toggleFavoriteModel,
    } = useModelContext();
    const { selectedAgent } = useAgent();
    const { colors } = useTheme();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const { socketClient, ensureConnected, connectionError, isConfigured } =
        useAgentchatSocket();

    const [inputText, setInputText] = useState("");
    const [error, setError] = useState<RuntimeErrorState | null>(null);
    const [retryPayload, setRetryPayload] = useState<RetryChatState | null>(
        null,
    );
    const [isLoading, setIsLoading] = useState(false);
    const [streamingMessage, setStreamingMessage] =
        useState<StreamingMessageState | null>(null);
    const [activeRun, setActiveRun] = useState<ActiveRunState | null>(null);
    const [recoveredRunNotice, setRecoveredRunNotice] = useState(false);

    const flatListRef = useRef<FlatList<Message>>(null);
    const isAtBottomRef = useRef(true);
    const inputSuppressionTimeoutRef = useRef<ReturnType<
        typeof setTimeout
    > | null>(null);
    const [expandedReasoning, setExpandedReasoning] = useState<
        Record<string, boolean>
    >({});
    const { width: windowWidth, height: windowHeight } = useWindowDimensions();
    const screenWidth = windowWidth;
    const { useTabletLandscapeLayout } = resolveResponsiveLayout({
        width: windowWidth,
        height: windowHeight,
    });
    const sidebarWidth = Math.max(280, Math.min(360, windowWidth * 0.32));
    const suppressInputRef = useRef(false);
    const currentChatRef = useRef<ChatSession | null>(currentChat);
    const chatMessagesRef = useRef<Message[]>(EMPTY_MESSAGES);
    const activeRunRef = useRef<ActiveRunState | null>(null);
    const pendingReconnectNoticeRef = useRef(false);
    const conversationSubscriptionCleanupRef = useRef<(() => void) | null>(
        null,
    );

    const scrollToEnd = useCallback(() => {
        try {
            flatListRef.current?.scrollToEnd?.({ animated: false });
        } catch {
            // Ignore best-effort scroll failures during layout churn.
        }
    }, []);

    useEffect(() => {
        if (!chatId) {
            return;
        }

        if (currentChat?.id === chatId) {
            return;
        }

        if (!chats.some((chat) => chat.id === chatId)) {
            return;
        }

        void selectChat(chatId);
    }, [chatId, chats, currentChat?.id, selectChat]);

    useEffect(() => {
        if (!chatId) {
            return;
        }

        const pendingShare = consumePendingSharePayload(chatId);
        if (!pendingShare?.text) {
            return;
        }

        const timeoutId = setTimeout(() => {
            setInputText((current) => current || pendingShare.text);
        }, 0);

        return () => {
            clearTimeout(timeoutId);
        };
    }, [chatId]);

    useEffect(() => {
        if (chats.length > 0) return;
        void loadChats();
    }, [chats.length, loadChats]);

    useEffect(() => {
        if (!useTabletLandscapeLayout) return;
        if (currentChat || chats.length === 0) return;
        router.replace(`/chat/${chats[0].id}`);
    }, [chats, currentChat, useTabletLandscapeLayout, router]);

    useEffect(() => {
        return () => {
            if (inputSuppressionTimeoutRef.current) {
                clearTimeout(inputSuppressionTimeoutRef.current);
            }
            conversationSubscriptionCleanupRef.current?.();
            conversationSubscriptionCleanupRef.current = null;
        };
    }, []);

    useEffect(() => {
        conversationSubscriptionCleanupRef.current?.();
        conversationSubscriptionCleanupRef.current = null;
    }, [chatId]);

    useEffect(() => {
        if (flatListRef.current && messages[chatId]) {
            setTimeout(() => {
                scrollToEnd();
            }, 100);
        }
    }, [messages, chatId, scrollToEnd]);

    const currentModel = models.find((m) => m.id === currentChat?.modelId);
    const reasoningSupported = modelSupportsReasoning(currentModel);
    const chatMessages = useMemo(() => {
        if (!chatId) return EMPTY_MESSAGES;
        return messages[chatId] ?? EMPTY_MESSAGES;
    }, [chatId, messages]);
    const displayedMessages = useMemo(
        () => applyStreamingMessageOverlay(chatMessages, streamingMessage),
        [chatMessages, streamingMessage],
    );
    const hasLoadedMessages = Boolean(chatId && messages[chatId] !== undefined);
    const showSkeletons = !hasLoadedMessages;
    const showEmptyState = hasLoadedMessages && displayedMessages.length === 0;

    useEffect(() => {
        currentChatRef.current = currentChat;
    }, [currentChat]);

    useEffect(() => {
        if (!currentChat) {
            return;
        }

        syncSelectionFromChat({
            modelId: currentChat.modelId,
            variantId: currentChat.variantId ?? null,
        });
    }, [currentChat, syncSelectionFromChat]);

    useEffect(() => {
        chatMessagesRef.current = chatMessages;
    }, [chatMessages]);

    useEffect(() => {
        activeRunRef.current = activeRun;
    }, [activeRun]);

    useEffect(() => {
        if (!currentChat || !hasLoadedMessages) return;

        const resolvedSettings = resolveChatSettingsAgainstModels({
            current: {
                modelId: currentChat.modelId,
                variantId: currentChat.variantId ?? null,
            },
            defaults: {
                modelId: defaultModel,
                variantId: selectedVariantId,
            },
            models,
        });

        if (
            resolvedSettings.modelId !== currentChat.modelId ||
            (resolvedSettings.variantId ?? null) !==
                (currentChat.variantId ?? null)
        ) {
            void updateChat({
                ...currentChat,
                modelId: resolvedSettings.modelId,
                variantId: resolvedSettings.variantId ?? null,
            });
        }
    }, [
        currentChat,
        defaultModel,
        hasLoadedMessages,
        models,
        selectedVariantId,
        updateChat,
    ]);

    const handleModelChange = async (modelId: string) => {
        if (!currentChat) return;
        if (currentChat.settingsLockedAt != null) return;
        await setSelectedModel(modelId);
        const nextModel = models.find((model) => model.id === modelId);
        const nextVariantId = nextModel?.variants?.some(
            (variant) => variant.id === selectedVariantId,
        )
            ? selectedVariantId
            : (nextModel?.variants?.[0]?.id ?? null);
        const updatedChat = {
            ...currentChat,
            modelId,
            variantId: nextVariantId,
        };
        await updateChat(updatedChat);
    };

    const handleVariantChange = async (variantId: string) => {
        if (!currentChat) return;
        if (currentChat.settingsLockedAt != null) return;
        await setSelectedVariant(variantId);
        const updatedChat = {
            ...currentChat,
            variantId,
        };
        await updateChat(updatedChat);
    };

    const persistAssistantMessage = useCallback(
        async (params: {
            messageId: string;
            content: string;
            status: NonNullable<Message["status"]>;
            runId: string | null;
        }) => {
            const existingMessage =
                chatMessagesRef.current.find(
                    (message) => message.id === params.messageId,
                ) ?? null;
            if (!existingMessage) {
                return;
            }

            await updateMessage({
                ...existingMessage,
                content: params.content,
                contextContent: params.content,
                status: params.status,
                runId: params.runId,
                updatedAt: Date.now(),
                completedAt: params.status === "streaming" ? null : Date.now(),
            });
        },
        [updateMessage],
    );

    useEffect(() => {
        const unsubscribe = socketClient.subscribe((event) => {
            if (event.type === "connection.reconnected") {
                pendingReconnectNoticeRef.current = true;
                return;
            }

            if (event.type === "connection.error") {
                const nextActiveRun = activeRunRef.current;
                if (!nextActiveRun) {
                    return;
                }

                setError({
                    message: event.payload.message,
                    isRetryable: true,
                });
                setRetryPayload({
                    content: nextActiveRun.userContent,
                    contextContent: nextActiveRun.userContent,
                });
                setActiveRun(null);
                setStreamingMessage(null);
                setRecoveredRunNotice(false);
                setIsLoading(false);
                return;
            }

            const resolution = resolveConversationSocketEvent({
                currentChatId: currentChatRef.current?.id ?? null,
                event,
                activeRun: activeRunRef.current,
                messages: chatMessagesRef.current,
            });

            if (resolution.type === "ignore") {
                return;
            }

            if (resolution.type === "run.started") {
                setActiveRun(resolution.activeRun);
                setIsLoading(true);
                if (resolution.recovered) {
                    setRecoveredRunNotice(pendingReconnectNoticeRef.current);
                    pendingReconnectNoticeRef.current = false;
                    if (resolution.streamingMessage) {
                        setStreamingMessage(resolution.streamingMessage);
                    }
                }
                return;
            }

            if (resolution.type === "message.updated") {
                setActiveRun(resolution.activeRun);
                setStreamingMessage(resolution.streamingMessage);
                return;
            }

            if (resolution.type === "message.started") {
                if (resolution.previousMessagePatch) {
                    patchMessage(
                        resolution.previousMessagePatch.id,
                        currentChatRef.current?.id ??
                            resolution.activeRun.conversationId,
                        {
                            kind: resolution.previousMessagePatch.kind,
                        },
                    );
                }
                insertMessage(resolution.message);
                setActiveRun(resolution.activeRun);
                setStreamingMessage(resolution.streamingMessage);
                return;
            }

            if (resolution.type === "message.completed") {
                patchMessage(
                    resolution.messageId,
                    currentChatRef.current?.id ??
                        resolution.activeRun.conversationId,
                    {
                        content: resolution.finalContent,
                        contextContent: resolution.finalContent,
                        status: "completed",
                    },
                );
                setActiveRun(resolution.activeRun);
                if (
                    resolution.messageId ===
                    resolution.activeRun.assistantMessageId
                ) {
                    setStreamingMessage({
                        id: resolution.messageId,
                        content: resolution.finalContent,
                    });
                }
                return;
            }

            if (resolution.type === "run.completed") {
                void persistAssistantMessage({
                    messageId: resolution.activeRun.assistantMessageId,
                    content: resolution.finalContent,
                    status: "completed",
                    runId: resolution.activeRun.runId,
                }).finally(() => {
                    setActiveRun(null);
                    setStreamingMessage(null);
                    setRecoveredRunNotice(false);
                    setIsLoading(false);
                });
                return;
            }

            if (resolution.type === "run.interrupted") {
                void persistAssistantMessage({
                    messageId: resolution.activeRun.assistantMessageId,
                    content: resolution.finalContent,
                    status: "interrupted",
                    runId: resolution.activeRun.runId,
                }).finally(() => {
                    setActiveRun(null);
                    setStreamingMessage(null);
                    setRecoveredRunNotice(false);
                    setIsLoading(false);
                });
                return;
            }

            if (resolution.type === "run.failed") {
                void persistAssistantMessage({
                    messageId: resolution.activeRun.assistantMessageId,
                    content: resolution.finalContent,
                    status: "errored",
                    runId: resolution.activeRun.runId,
                }).finally(() => {
                    setError(resolution.error);
                    setRetryPayload(resolution.retryChat);
                    setActiveRun(null);
                    setStreamingMessage(null);
                    setRecoveredRunNotice(false);
                    setIsLoading(false);
                });
            }
        });

        return unsubscribe;
    }, [insertMessage, patchMessage, persistAssistantMessage, socketClient]);

    useEffect(() => {
        if (!currentChat) {
            startTransition(() => {
                setActiveRun(null);
                setStreamingMessage(null);
                setRecoveredRunNotice(false);
                setIsLoading(false);
            });
            return;
        }

        const syncResolution = resolveMobileConversationRuntimeSync({
            currentChat,
            isMessagesLoading: !hasLoadedMessages,
            messages: chatMessages,
            runtimeState,
            activeRun: activeRunRef.current,
        });

        if (syncResolution.shouldReset) {
            startTransition(() => {
                setActiveRun(null);
                setStreamingMessage(null);
                setRecoveredRunNotice(false);
                setIsLoading(false);
            });
        }

        const recoveredRun = syncResolution.recoveredRun;

        if (!recoveredRun) {
            if (
                runtimeState.phase !== "active" &&
                runtimeState.phase !== "recovering"
            ) {
                pendingReconnectNoticeRef.current = false;
            }
            return;
        }

        startTransition(() => {
            setActiveRun(recoveredRun);
            setStreamingMessage({
                id: recoveredRun.assistantMessageId,
                content: recoveredRun.content,
            });
            setRecoveredRunNotice(pendingReconnectNoticeRef.current);
            pendingReconnectNoticeRef.current = false;
            setIsLoading(true);
        });
    }, [chatMessages, currentChat, hasLoadedMessages, runtimeState]);

    const handleSendMessage = async (content: string): Promise<boolean> => {
        if (!currentChat) {
            setError({ message: "No chat selected", isRetryable: false });
            return false;
        }

        const result = await runMobileConversationSend({
            chat: currentChat,
            messages: chatMessages,
            models,
            content,
            dependencies: {
                addMessage,
                updateMessage,
                updateChat,
                queueStreamingMessageUpdate: setStreamingMessage,
                ensureConnected: async () => {
                    if (!conversationSubscriptionCleanupRef.current) {
                        conversationSubscriptionCleanupRef.current =
                            socketClient.subscribeToConversation(
                                currentChat.id,
                            );
                    }
                    try {
                        await ensureConnected();
                    } catch (error) {
                        conversationSubscriptionCleanupRef.current?.();
                        conversationSubscriptionCleanupRef.current = null;
                        throw error;
                    }
                },
                sendCommand: (command) => {
                    socketClient.send(command);
                },
            },
        });

        if (result.status === "failed") {
            setError(result.error);
            setRetryPayload(result.retryChat);
            setIsLoading(false);
            return false;
        }

        setError(null);
        setRetryPayload(null);
        setRecoveredRunNotice(false);
        setActiveRun(result.activeRun);
        setIsLoading(true);
        return true;
    };

    const handleSend = async () => {
        if (!inputText.trim() || isLoading || !currentChat) return;

        const content = inputText.trim();
        const didSend = await handleSendMessage(content);
        if (!didSend) {
            return;
        }

        if (inputSuppressionTimeoutRef.current) {
            clearTimeout(inputSuppressionTimeoutRef.current);
        }
        suppressInputRef.current = true;
        setInputText("");
        inputSuppressionTimeoutRef.current = setTimeout(() => {
            suppressInputRef.current = false;
            inputSuppressionTimeoutRef.current = null;
        }, 250);
    };

    const handleInputChange = useCallback((text: string) => {
        if (suppressInputRef.current) return;
        setInputText(text);
    }, []);

    const handleRetry = async () => {
        if (!retryPayload || isLoading) return;
        const { content } = retryPayload;
        setRetryPayload(null);
        setError(null);
        await handleSendMessage(content);
    };

    const handleCancel = useCallback(() => {
        const interruptError = interruptMobileConversationRun({
            activeRun,
            sendCommand: (command) => {
                socketClient.send(command);
            },
        });
        if (interruptError) {
            setError(interruptError);
        }
    }, [activeRun, socketClient]);

    const handleDeleteChat = async () => {
        const fallbackChatId = chats.find((chat) => chat.id !== chatId)?.id;
        const navigateAfterDelete = () => {
            if (useTabletLandscapeLayout && fallbackChatId) {
                router.replace(`/chat/${fallbackChatId}`);
                return;
            }
            router.replace("/");
        };

        if (chatMessages.length > 0) {
            Alert.alert("Delete Chat", "This chat has messages. Delete it?", [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Delete",
                    style: "destructive",
                    onPress: () => {
                        void (async () => {
                            await deleteChat(chatId);
                            navigateAfterDelete();
                        })();
                    },
                },
            ]);
            return;
        }

        await deleteChat(chatId);
        navigateAfterDelete();
    };

    const handleStartNewChat = async () => {
        const chat = await createChat();
        router.replace(`/chat/${chat.id}`);
    };

    const handleSelectChatFromSidebar = (nextChatId: string) => {
        if (nextChatId === chatId) return;
        router.replace(`/chat/${nextChatId}`);
    };

    const formatChatListDate = (timestamp: number): string => {
        const date = new Date(timestamp);
        const now = new Date();
        const diffDays = Math.floor(
            (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24),
        );

        if (diffDays === 0) {
            return date.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
            });
        }
        if (diffDays === 1) {
            return "Yesterday";
        }
        if (diffDays < 7) {
            return date.toLocaleDateString([], { weekday: "short" });
        }
        return date.toLocaleDateString([], {
            month: "short",
            day: "numeric",
        });
    };

    const renderTabletSidebar = () => {
        return (
            <View style={[styles.tabletSidebar, { width: sidebarWidth }]}>
                <View style={styles.tabletSidebarHeader}>
                    <View style={styles.tabletSidebarAgentSwitch}>
                        <AgentSwitcher
                            compact
                            onAgentChange={() => router.replace("/")}
                        />
                    </View>
                    <TouchableOpacity
                        style={styles.tabletSidebarHeaderButton}
                        onPress={() => router.push("/settings")}
                        accessibilityRole="button"
                        accessibilityLabel="Open settings"
                    >
                        <Feather
                            name="settings"
                            size={18}
                            color={colors.accent}
                        />
                    </TouchableOpacity>
                </View>
                {chats.length === 0 ? (
                    <View style={styles.tabletSidebarEmpty}>
                        <Text style={styles.tabletSidebarEmptyText}>
                            No chats yet
                        </Text>
                        <TouchableOpacity
                            style={styles.tabletSidebarEmptyButton}
                            onPress={() => {
                                void handleStartNewChat();
                            }}
                            accessibilityRole="button"
                            accessibilityLabel="Start new chat"
                        >
                            <Feather
                                name="plus"
                                size={16}
                                color={colors.textOnAccent}
                            />
                            <Text style={styles.tabletSidebarEmptyButtonText}>
                                New Chat
                            </Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    <FlatList
                        data={chats}
                        keyExtractor={(item) => item.id}
                        contentContainerStyle={styles.tabletSidebarListContent}
                        renderItem={({ item }) => {
                            const isActive = item.id === chatId;
                            return (
                                <TouchableOpacity
                                    style={[
                                        styles.tabletSidebarChatItem,
                                        isActive &&
                                            styles.tabletSidebarChatItemActive,
                                    ]}
                                    onPress={() =>
                                        handleSelectChatFromSidebar(item.id)
                                    }
                                >
                                    <Text
                                        style={styles.tabletSidebarChatTitle}
                                        numberOfLines={1}
                                    >
                                        {item.title}
                                    </Text>
                                    <Text style={styles.tabletSidebarChatDate}>
                                        {formatChatListDate(item.updatedAt)}
                                    </Text>
                                </TouchableOpacity>
                            );
                        }}
                    />
                )}
                {chats.length > 0 ? (
                    <TouchableOpacity
                        style={styles.tabletSidebarFab}
                        onPress={() => {
                            void handleStartNewChat();
                        }}
                        accessibilityRole="button"
                        accessibilityLabel="Start new chat"
                    >
                        <Feather
                            name="plus"
                            size={22}
                            color={colors.textOnAccent}
                        />
                    </TouchableOpacity>
                ) : null}
            </View>
        );
    };

    const toggleReasoning = (messageId: string) => {
        setExpandedReasoning((prev) => ({
            ...prev,
            [messageId]: !prev[messageId],
        }));
    };

    const formatMessageTime = (timestamp: number): string => {
        return new Date(timestamp).toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit",
        });
    };

    const getModelDisplayName = (
        modelId: string | undefined,
        modelList: ProviderModel[],
    ): string => {
        if (!modelId) return "Unknown model";
        const model = modelList.find((entry) => entry.id === modelId);
        if (model?.name) return model.name;
        const parts = modelId.split("/");
        return parts.length > 1 ? parts[1] : modelId;
    };

    const renderMessage = ({ item }: { item: Message }) => {
        const isUser = item.role === "user";
        const isAssistantStatus = !isUser && item.kind === "assistant_status";
        const displayContent = item.content;
        const displayReasoning = item.reasoning;
        const isStreamingMessage = activeRun?.assistantMessageId === item.id;
        const showReasoningIndicator = false;
        const hideContentWhileReasoning = false;
        const showGenerating =
            isStreamingMessage &&
            !displayContent &&
            !displayReasoning &&
            item.role === "assistant";
        const hasReasoningBadge =
            item.reasoningEffort !== undefined &&
            item.reasoningEffort !== "none";
        const hasModelBadge = Boolean(item.modelId);
        const showDivider = hasReasoningBadge || hasModelBadge;
        const modelDisplayName = getModelDisplayName(item.modelId, models);
        const messageTimestamp = (
            <Text
                style={[
                    styles.messageMetaText,
                    isUser && styles.messageMetaTextUser,
                ]}
            >
                {formatMessageTime(item.createdAt)}
            </Text>
        );
        const messageBadges = (
            <>
                {hasReasoningBadge && (
                    <View style={[styles.messageBadge, styles.reasoningBadge]}>
                        <Text
                            style={[
                                styles.messageBadgeText,
                                styles.reasoningBadgeText,
                            ]}
                        >
                            {item.reasoningEffort?.toUpperCase()}
                        </Text>
                    </View>
                )}
                {hasModelBadge && (
                    <TouchableOpacity
                        style={[styles.messageBadge, styles.modelBadge]}
                        activeOpacity={0.7}
                        onPress={() => Alert.alert("Model", modelDisplayName)}
                    >
                        <Feather
                            name="cpu"
                            size={12}
                            color={colors.textMuted}
                            style={styles.modelBadgeIcon}
                        />
                        <Text
                            style={[
                                styles.messageBadgeText,
                                styles.modelBadgeText,
                            ]}
                            numberOfLines={1}
                        >
                            {modelDisplayName}
                        </Text>
                    </TouchableOpacity>
                )}
            </>
        );
        const messageDivider = showDivider ? (
            <View style={styles.messageMetaDivider} />
        ) : null;

        return (
            <View
                style={[
                    styles.messageGroup,
                    isUser
                        ? styles.messageGroupUser
                        : styles.messageGroupAssistant,
                ]}
            >
                {displayReasoning && (
                    <View
                        style={[
                            styles.reasoningPanel,
                            styles.reasoningPanelOutside,
                        ]}
                    >
                        <TouchableOpacity
                            style={styles.reasoningHeader}
                            onPress={() => toggleReasoning(item.id)}
                            activeOpacity={0.7}
                        >
                            <Feather
                                name={
                                    expandedReasoning[item.id]
                                        ? "chevron-down"
                                        : "chevron-right"
                                }
                                size={14}
                                color={colors.warning}
                                style={styles.reasoningChevron}
                            />
                            <MaterialCommunityIcons
                                name="brain"
                                size={14}
                                color={colors.warning}
                                style={styles.reasoningIcon}
                            />
                            <Text style={styles.reasoningLabel}>Reasoning</Text>
                            {showReasoningIndicator && (
                                <ActivityIndicator
                                    size="small"
                                    color={colors.warning}
                                    style={styles.reasoningIndicator}
                                />
                            )}
                        </TouchableOpacity>
                        {expandedReasoning[item.id] && (
                            <View style={styles.reasoningContent}>
                                <Text style={styles.reasoningText}>
                                    {displayReasoning}
                                </Text>
                            </View>
                        )}
                    </View>
                )}
                {!hideContentWhileReasoning && (
                    <View
                        style={[
                            styles.messageContainer,
                            isUser
                                ? styles.userMessage
                                : styles.assistantMessage,
                            isAssistantStatus && styles.assistantStatusMessage,
                        ]}
                    >
                        {isAssistantStatus && (
                            <View style={styles.statusMessageLabelRow}>
                                <MaterialCommunityIcons
                                    name="cpu-64-bit"
                                    size={12}
                                    color={colors.textMuted}
                                />
                                <Text style={styles.statusMessageLabel}>
                                    Working note
                                </Text>
                            </View>
                        )}
                        {showGenerating ? (
                            <View style={styles.generatingRow}>
                                <ActivityIndicator
                                    size="small"
                                    color={colors.textMuted}
                                />
                                <Text style={styles.generatingText}>
                                    Generating...
                                </Text>
                            </View>
                        ) : displayContent ? (
                            <MarkdownRenderer
                                content={displayContent}
                                isUser={isUser}
                            />
                        ) : !isUser ? (
                            <Text style={styles.emptyMessageText}>...</Text>
                        ) : null}
                    </View>
                )}
                <View
                    style={[
                        styles.messageMetaRow,
                        isUser
                            ? styles.messageMetaRowUser
                            : styles.messageMetaRowAssistant,
                    ]}
                >
                    {isUser ? messageBadges : messageTimestamp}
                    {messageDivider}
                    {isUser ? messageTimestamp : messageBadges}
                </View>
            </View>
        );
    };

    const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
        const { layoutMeasurement, contentOffset, contentSize } =
            event.nativeEvent;
        const paddingToBottom = 24;
        const isAtBottom =
            layoutMeasurement.height + contentOffset.y >=
            contentSize.height - paddingToBottom;
        isAtBottomRef.current = isAtBottom;
    };

    const renderListEmpty = () => {
        if (showSkeletons) {
            const skeletonItems = [
                { align: "left", width: screenWidth * 0.68, height: 48 },
                { align: "right", width: screenWidth * 0.6, height: 36 },
                { align: "left", width: screenWidth * 0.52, height: 32 },
                { align: "right", width: screenWidth * 0.74, height: 52 },
            ];
            return (
                <View style={styles.skeletonContainer}>
                    {skeletonItems.map((item, index) => (
                        <View
                            key={`skeleton-${index}`}
                            style={[
                                styles.skeletonBubble,
                                item.align === "left"
                                    ? styles.skeletonBubbleAssistant
                                    : styles.skeletonBubbleUser,
                                {
                                    width: item.width,
                                    height: item.height,
                                },
                            ]}
                        />
                    ))}
                </View>
            );
        }

        if (!showEmptyState) return null;

        return (
            <View style={styles.emptyStateContainer}>
                <View style={styles.emptyStateIcon}>
                    <Feather
                        name="message-circle"
                        size={20}
                        color={colors.textMuted}
                    />
                </View>
                <Text style={styles.emptyStateTitle}>No messages yet</Text>
                <Text style={styles.emptyStateSubtitle}>
                    Send a message to start the conversation.
                </Text>
            </View>
        );
    };

    if (!currentChat) {
        return (
            <SafeAreaView
                style={styles.container}
                edges={["top", "left", "right"]}
            >
                {useTabletLandscapeLayout ? (
                    <View style={styles.tabletLayout}>
                        {renderTabletSidebar()}
                        <View style={styles.tabletThreadPaneLoading}>
                            <ActivityIndicator
                                size="large"
                                color={colors.accent}
                            />
                        </View>
                    </View>
                ) : (
                    <ActivityIndicator size="large" color={colors.accent} />
                )}
            </SafeAreaView>
        );
    }

    const threadContent = (
        <>
            <TopBar
                title={currentChat.title}
                subtitle={selectedAgent?.name ?? "Agentchat"}
                leftSlot={
                    useTabletLandscapeLayout ? null : (
                        <TouchableOpacity
                            onPress={() => router.replace("/")}
                            style={styles.iconButton}
                            accessibilityRole="button"
                            accessibilityLabel="Back to chats"
                        >
                            <Feather
                                name="arrow-left"
                                size={20}
                                color={colors.accent}
                            />
                        </TouchableOpacity>
                    )
                }
                rightSlot={
                    <TouchableOpacity
                        onPress={handleDeleteChat}
                        style={[styles.iconButton, styles.deleteButton]}
                        accessibilityRole="button"
                        accessibilityLabel="Delete chat"
                    >
                        <Feather
                            name="trash-2"
                            size={18}
                            color={colors.danger}
                        />
                    </TouchableOpacity>
                }
            />

            {error && (
                <View style={styles.errorBanner}>
                    <Feather
                        name="alert-circle"
                        size={16}
                        color={colors.danger}
                    />
                    <Text style={styles.errorBannerText}>{error.message}</Text>
                    {error.isRetryable && (
                        <TouchableOpacity
                            style={styles.retryButton}
                            onPress={handleRetry}
                            disabled={isLoading}
                            activeOpacity={0.7}
                        >
                            <Feather
                                name="refresh-cw"
                                size={14}
                                color={colors.danger}
                            />
                            <Text style={styles.retryText}>Retry</Text>
                        </TouchableOpacity>
                    )}
                </View>
            )}
            {!error && recoveredRunNotice && (
                <View style={styles.infoBanner}>
                    <Feather
                        name="refresh-cw"
                        size={16}
                        color={colors.accent}
                    />
                    <Text style={styles.infoBannerText}>
                        Reconnected to the active run for this conversation.
                    </Text>
                </View>
            )}
            {!error && runtimeState.phase === "failed" && (
                <View style={styles.errorBanner}>
                    <Feather
                        name="alert-circle"
                        size={16}
                        color={colors.danger}
                    />
                    <Text style={styles.errorBannerText}>
                        {runtimeState.errorMessage ??
                            "The last run for this conversation failed."}
                    </Text>
                </View>
            )}
            {!error && runtimeState.phase === "interrupted" && (
                <View style={styles.warningBanner}>
                    <Feather
                        name="alert-circle"
                        size={16}
                        color={colors.warning}
                    />
                    <Text style={styles.warningBannerText}>
                        The last run for this conversation was interrupted.
                    </Text>
                </View>
            )}
            {!error && !isConfigured && (
                <View style={styles.errorBanner}>
                    <Feather
                        name="alert-circle"
                        size={16}
                        color={colors.danger}
                    />
                    <Text style={styles.errorBannerText}>
                        EXPO_PUBLIC_AGENTCHAT_SERVER_URL is not configured for
                        the mobile app.
                    </Text>
                </View>
            )}
            {!error && isConfigured && connectionError && (
                <View style={styles.infoBanner}>
                    <Feather name="wifi-off" size={16} color={colors.warning} />
                    <Text style={styles.infoBannerText}>{connectionError}</Text>
                </View>
            )}

            <KeyboardAvoidingView
                behavior={Platform.OS === "ios" ? "padding" : "height"}
                style={styles.content}
            >
                <FlatList
                    ref={flatListRef}
                    data={displayedMessages}
                    keyExtractor={(item) => item.id}
                    renderItem={renderMessage}
                    contentContainerStyle={[
                        styles.listContent,
                        showEmptyState && styles.listContentEmpty,
                    ]}
                    style={styles.list}
                    keyboardShouldPersistTaps="handled"
                    ListEmptyComponent={renderListEmpty}
                    onScroll={handleScroll}
                    scrollEventThrottle={16}
                    onContentSizeChange={() => {
                        if (isAtBottomRef.current) {
                            scrollToEnd();
                        }
                    }}
                />

                <MessageInput
                    inputText={inputText}
                    onInputChange={handleInputChange}
                    onSend={handleSend}
                    onCancel={handleCancel}
                    isLoading={isLoading}
                    settingsLocked={Boolean(currentChat.settingsLockedAt)}
                    models={models}
                    availableProviders={availableProviders}
                    selectedProviderId={selectedProviderId}
                    onProviderChange={selectProvider}
                    selectedModelId={currentChat.modelId}
                    onModelChange={handleModelChange}
                    availableVariants={availableVariants}
                    selectedVariantId={
                        currentChat.variantId ?? selectedVariantId
                    }
                    onVariantChange={handleVariantChange}
                    favoriteModels={favoriteModels}
                    onToggleFavoriteModel={toggleFavoriteModel}
                    reasoningSupported={reasoningSupported}
                />
            </KeyboardAvoidingView>
        </>
    );

    return (
        <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
            {useTabletLandscapeLayout ? (
                <View style={styles.tabletLayout}>
                    {renderTabletSidebar()}
                    <View style={styles.tabletThreadPane}>{threadContent}</View>
                </View>
            ) : (
                threadContent
            )}
        </SafeAreaView>
    );
}

const createStyles = (colors: ThemeColors) =>
    StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: colors.background,
        },
        tabletLayout: {
            flex: 1,
            flexDirection: "row",
        },
        tabletSidebar: {
            borderRightWidth: 1,
            borderRightColor: colors.border,
            backgroundColor: colors.surface,
        },
        tabletSidebarHeader: {
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 16,
            paddingVertical: 12,
            gap: 12,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
        },
        tabletSidebarAgentSwitch: {
            flex: 1,
            minWidth: 0,
        },
        tabletSidebarHeaderButton: {
            width: 34,
            height: 34,
            borderRadius: 17,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: colors.accentSoft,
            borderWidth: 1,
            borderColor: colors.accentBorder,
        },
        tabletSidebarListContent: {
            padding: 12,
            paddingBottom: 88,
            gap: 8,
        },
        tabletSidebarChatItem: {
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surfaceMuted,
            paddingHorizontal: 12,
            paddingVertical: 10,
            gap: 4,
        },
        tabletSidebarChatItemActive: {
            borderColor: colors.accentBorder,
            backgroundColor: colors.accentSoft,
        },
        tabletSidebarChatTitle: {
            fontSize: 14,
            fontWeight: "600",
            color: colors.text,
        },
        tabletSidebarChatDate: {
            fontSize: 12,
            color: colors.textSubtle,
        },
        tabletSidebarEmpty: {
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 24,
            gap: 16,
        },
        tabletSidebarEmptyText: {
            fontSize: 14,
            color: colors.textMuted,
            textAlign: "center",
        },
        tabletSidebarEmptyButton: {
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            paddingHorizontal: 14,
            paddingVertical: 10,
            borderRadius: 12,
            backgroundColor: colors.accent,
        },
        tabletSidebarEmptyButtonText: {
            fontSize: 14,
            fontWeight: "700",
            color: colors.textOnAccent,
        },
        tabletSidebarFab: {
            position: "absolute",
            right: 16,
            bottom: 16,
            width: 48,
            height: 48,
            borderRadius: 24,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: colors.accent,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.18,
            shadowRadius: 4,
            elevation: 4,
        },
        tabletThreadPane: {
            flex: 1,
            minWidth: 0,
        },
        tabletThreadPaneLoading: {
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
        },
        iconButton: {
            width: 36,
            height: 36,
            borderRadius: 18,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surfaceMuted,
        },
        deleteButton: {
            borderColor: colors.dangerSoft,
            backgroundColor: colors.dangerSoft,
        },
        errorBanner: {
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            paddingHorizontal: 16,
            paddingVertical: 10,
            backgroundColor: colors.dangerSoft,
            borderBottomWidth: 1,
            borderBottomColor: colors.danger,
        },
        errorBannerText: {
            flex: 1,
            fontSize: 13,
            color: colors.danger,
        },
        infoBanner: {
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            paddingHorizontal: 16,
            paddingVertical: 10,
            backgroundColor: colors.accentSoft,
            borderBottomWidth: 1,
            borderBottomColor: colors.accentBorder,
        },
        infoBannerText: {
            flex: 1,
            fontSize: 13,
            color: colors.text,
        },
        warningBanner: {
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            paddingHorizontal: 16,
            paddingVertical: 10,
            backgroundColor: colors.warningSoft,
            borderBottomWidth: 1,
            borderBottomColor: colors.warning,
        },
        warningBannerText: {
            flex: 1,
            fontSize: 13,
            color: colors.warning,
        },
        retryButton: {
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
            paddingHorizontal: 8,
            paddingVertical: 4,
            borderRadius: 6,
            borderWidth: 1,
            borderColor: colors.danger,
            backgroundColor: colors.dangerSoft,
        },
        retryText: {
            fontSize: 12,
            fontWeight: "600",
            color: colors.danger,
        },
        listContent: {
            padding: 16,
        },
        listContentEmpty: {
            flexGrow: 1,
            justifyContent: "center",
            alignItems: "center",
            paddingVertical: 32,
        },
        content: {
            flex: 1,
        },
        list: {
            flex: 1,
        },
        skeletonContainer: {
            gap: 12,
            paddingTop: 8,
        },
        skeletonBubble: {
            borderRadius: 16,
            backgroundColor: colors.surfaceMuted,
            borderWidth: 1,
            borderColor: colors.borderMuted,
        },
        skeletonBubbleAssistant: {
            alignSelf: "flex-start",
        },
        skeletonBubbleUser: {
            alignSelf: "flex-end",
        },
        emptyStateContainer: {
            alignItems: "center",
            gap: 8,
            paddingHorizontal: 24,
        },
        emptyStateIcon: {
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: colors.surfaceMuted,
            alignItems: "center",
            justifyContent: "center",
        },
        emptyStateTitle: {
            fontSize: 16,
            fontWeight: "600",
            color: colors.text,
        },
        emptyStateSubtitle: {
            fontSize: 13,
            color: colors.textMuted,
            textAlign: "center",
        },
        messageContainer: {
            maxWidth: "85%",
            padding: 12,
            borderRadius: 16,
        },
        generatingRow: {
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
        },
        generatingText: {
            fontSize: 14,
            color: colors.textMuted,
        },
        messageGroup: {
            alignSelf: "stretch",
        },
        messageGroupUser: {
            alignItems: "flex-end",
        },
        messageGroupAssistant: {
            alignItems: "flex-start",
        },
        userMessage: {
            alignSelf: "flex-end",
            backgroundColor: colors.accentSoft,
            borderWidth: 1,
            borderColor: colors.accentBorder,
        },
        assistantMessage: {
            alignSelf: "flex-start",
            backgroundColor: colors.surfaceMuted,
        },
        assistantStatusMessage: {
            borderWidth: 1,
            borderColor: colors.border,
        },
        statusMessageLabelRow: {
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            marginBottom: 8,
        },
        statusMessageLabel: {
            fontSize: 11,
            fontWeight: "600",
            textTransform: "uppercase",
            letterSpacing: 1,
            color: colors.textMuted,
        },
        emptyMessageText: {
            fontSize: 14,
            color: colors.textMuted,
            fontStyle: "italic",
        },
        messageText: {
            fontSize: 16,
            lineHeight: 22,
        },
        userMessageText: {
            color: colors.textOnAccent,
        },
        assistantMessageText: {
            color: colors.text,
        },
        messageMetaRow: {
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            marginTop: 6,
            marginBottom: 8,
            flexWrap: "wrap",
        },
        messageMetaRowUser: {
            justifyContent: "flex-end",
        },
        messageMetaRowAssistant: {
            justifyContent: "flex-start",
        },
        messageMetaText: {
            fontSize: 11,
            color: colors.textSubtle,
        },
        messageMetaTextUser: {
            color: colors.textMuted,
        },
        messageMetaDivider: {
            width: 1,
            height: 12,
            backgroundColor: colors.border,
        },
        messageBadge: {
            paddingHorizontal: 6,
            paddingVertical: 2,
            borderRadius: 6,
            borderWidth: 1,
        },
        messageBadgeText: {
            fontSize: 10,
            fontWeight: "600",
            letterSpacing: 0.4,
            textTransform: "uppercase" as const,
        },
        searchBadge: {
            backgroundColor: colors.accentSoft,
            borderColor: colors.accentBorder,
        },
        searchBadgeText: {
            color: colors.accent,
        },
        searchBadgeUser: {
            backgroundColor: colors.surface,
            borderColor: colors.accentBorder,
        },
        searchBadgeTextUser: {
            color: colors.accent,
        },
        reasoningBadge: {
            backgroundColor: colors.warningSoft,
            borderColor: colors.warningBorder,
        },
        reasoningBadgeText: {
            color: colors.warning,
        },
        modelBadge: {
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
            backgroundColor: colors.surfaceSubtle,
            borderColor: colors.border,
            maxWidth: 140,
        },
        modelBadgeIcon: {
            marginTop: 1,
        },
        modelBadgeText: {
            color: colors.textMuted,
            textTransform: "none" as const,
            fontWeight: "500",
        },
        reasoningPanel: {
            marginTop: 8,
            borderWidth: 1,
            borderColor: colors.warningBorder,
            backgroundColor: colors.warningSoft,
            borderRadius: 8,
            overflow: "hidden",
        },
        reasoningPanelOutside: {
            marginTop: 6,
            marginBottom: 4,
            maxWidth: "85%",
        },
        reasoningHeader: {
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 12,
            paddingVertical: 8,
            backgroundColor: colors.warningSoft,
        },
        reasoningIndicator: {
            marginLeft: 8,
        },
        reasoningChevron: {
            marginRight: 6,
        },
        reasoningIcon: {
            marginRight: 6,
        },
        reasoningLabel: {
            fontSize: 12,
            fontWeight: "600",
            color: colors.warning,
            textTransform: "uppercase" as const,
            letterSpacing: 0.5,
        },
        reasoningContent: {
            paddingHorizontal: 12,
            paddingTop: 8,
            paddingBottom: 8,
            borderTopWidth: 1,
            borderTopColor: colors.warningBorder,
        },
        reasoningText: {
            fontSize: 13,
            color: colors.textMuted,
            lineHeight: 19,
        },
    });
