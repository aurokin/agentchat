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
    resolveThinkingLevelForVariant,
    type ProviderModel,
} from "@shared/core/models";
import type { ChatSession, Message } from "@shared/core/types";
import {
    applyModelCapabilities,
    getLastUserSettings,
    resolveInitialChatSettings,
} from "@shared/core/defaults";
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
import { consumePendingSharePayload } from "@/lib/share-intent/pending-share";
import {
    interruptMobileConversationRun,
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
        updateMessage,
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
    const [expandedThinking, setExpandedThinking] = useState<
        Record<string, boolean>
    >({});
    const { width: windowWidth, height: windowHeight } = useWindowDimensions();
    const screenWidth = windowWidth;
    const smallestSide = Math.min(windowWidth, windowHeight);
    const isTwoPaneLayout = smallestSide >= 700;
    const sidebarWidth = Math.max(280, Math.min(360, windowWidth * 0.32));
    const lastInitializedChatIdRef = useRef<string | null>(null);
    const suppressInputRef = useRef(false);
    const currentChatRef = useRef<ChatSession | null>(currentChat);
    const chatMessagesRef = useRef<Message[]>(EMPTY_MESSAGES);
    const activeRunRef = useRef<ActiveRunState | null>(null);

    useEffect(() => {
        if (chatId) {
            selectChat(chatId);
        }
    }, [chatId, selectChat]);

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
        if (!isTwoPaneLayout) return;
        if (currentChat || chats.length === 0) return;
        router.replace(`/chat/${chats[0].id}`);
    }, [chats, currentChat, isTwoPaneLayout, router]);

    useEffect(() => {
        return () => {
            if (inputSuppressionTimeoutRef.current) {
                clearTimeout(inputSuppressionTimeoutRef.current);
            }
        };
    }, []);

    useEffect(() => {
        if (!currentChat) {
            lastInitializedChatIdRef.current = null;
        }
    }, [currentChat]);

    useEffect(() => {
        if (flatListRef.current && messages[chatId]) {
            setTimeout(() => {
                flatListRef.current?.scrollToEnd?.({ animated: true });
            }, 100);
        }
    }, [messages, chatId]);

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
        chatMessagesRef.current = chatMessages;
    }, [chatMessages]);

    useEffect(() => {
        activeRunRef.current = activeRun;
    }, [activeRun]);

    useEffect(() => {
        if (!currentChat || !hasLoadedMessages) return;
        if (lastInitializedChatIdRef.current === currentChat.id) return;
        const defaults = {
            modelId: defaultModel,
            variantId: selectedVariantId,
            thinking: resolveThinkingLevelForVariant(selectedVariantId),
        };
        const lastUserSettings = getLastUserSettings(chatMessages);
        const resolvedSettings = resolveInitialChatSettings({
            messageCount: chatMessages.length,
            defaults,
            lastUser: lastUserSettings,
        });
        const modelForSettings = models.find(
            (model) => model.id === resolvedSettings.modelId,
        );
        const constrainedSettings = applyModelCapabilities(resolvedSettings, {
            supportsReasoning: modelForSettings
                ? modelSupportsReasoning(modelForSettings)
                : true,
        });

        if (
            constrainedSettings.modelId !== currentChat.modelId ||
            (constrainedSettings.variantId ?? null) !==
                (currentChat.variantId ?? null) ||
            constrainedSettings.thinking !== currentChat.thinking
        ) {
            void updateChat({
                ...currentChat,
                modelId: constrainedSettings.modelId,
                variantId: constrainedSettings.variantId ?? null,
                thinking: constrainedSettings.thinking,
            });
        }
        lastInitializedChatIdRef.current = currentChat.id;
    }, [
        chatMessages,
        currentChat,
        defaultModel,
        hasLoadedMessages,
        models,
        selectedVariantId,
        updateChat,
    ]);

    useEffect(() => {
        if (!currentChat || !currentModel) return;
        const currentVariantIsValid =
            !currentChat.variantId ||
            (currentModel.variants?.some(
                (variant) => variant.id === currentChat.variantId,
            ) ??
                false);
        const nextVariantId = currentVariantIsValid
            ? (currentChat.variantId ?? currentModel.variants?.[0]?.id ?? null)
            : (currentModel.variants?.[0]?.id ?? null);
        const nextThinking = reasoningSupported
            ? resolveThinkingLevelForVariant(
                  nextVariantId,
                  currentChat.thinking,
              )
            : "none";
        if (
            nextThinking !== currentChat.thinking ||
            nextVariantId !== (currentChat.variantId ?? null)
        ) {
            void updateChat({
                ...currentChat,
                variantId: nextVariantId,
                thinking: nextThinking,
            });
        }
    }, [currentChat, currentModel, reasoningSupported, updateChat]);

    const handleModelChange = async (modelId: string) => {
        if (!currentChat) return;
        await setSelectedModel(modelId);
        const nextModel = models.find((model) => model.id === modelId);
        const nextThinking = nextModel
            ? modelSupportsReasoning(nextModel)
                ? resolveThinkingLevelForVariant(
                      selectedVariantId,
                      currentChat.thinking,
                  )
                : "none"
            : currentChat.thinking;
        const nextVariantId = nextModel?.variants?.some(
            (variant) => variant.id === selectedVariantId,
        )
            ? selectedVariantId
            : (nextModel?.variants?.[0]?.id ?? null);
        const updatedChat = {
            ...currentChat,
            modelId,
            variantId: nextVariantId,
            thinking: nextThinking,
        };
        await updateChat(updatedChat);
    };

    const handleVariantChange = async (variantId: string) => {
        if (!currentChat) return;
        await setSelectedVariant(variantId);
        const updatedChat = {
            ...currentChat,
            variantId,
            thinking: resolveThinkingLevelForVariant(
                variantId,
                currentChat.thinking,
            ),
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
                    setRecoveredRunNotice(true);
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
    }, [persistAssistantMessage, socketClient]);

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

        const recoveredRun = createRecoveredActiveRunFromRuntimeState({
            conversationId: currentChat.id,
            messages: chatMessages,
            runtimeState,
        });

        if (!recoveredRun) {
            if (activeRunRef.current?.conversationId !== currentChat.id) {
                startTransition(() => {
                    setActiveRun(null);
                    setStreamingMessage(null);
                    setRecoveredRunNotice(false);
                    setIsLoading(false);
                });
            }
            return;
        }

        startTransition(() => {
            setActiveRun(recoveredRun);
            setStreamingMessage({
                id: recoveredRun.assistantMessageId,
                content: recoveredRun.content,
            });
            setRecoveredRunNotice(true);
            setIsLoading(true);
        });
    }, [chatMessages, currentChat, runtimeState]);

    useEffect(() => {
        if (!currentChat) {
            return;
        }

        const unsubscribe = socketClient.subscribeToConversation(
            currentChat.id,
        );
        void ensureConnected().catch((connectError: unknown) => {
            setError({
                message:
                    connectError instanceof Error
                        ? connectError.message
                        : "Failed to connect to the Agentchat server.",
                isRetryable: true,
            });
        });

        return unsubscribe;
    }, [currentChat, ensureConnected, socketClient]);

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
                setDefaultModel: setSelectedModel,
                queueStreamingMessageUpdate: setStreamingMessage,
                ensureConnected,
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
            if (isTwoPaneLayout && fallbackChatId) {
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
                    <View style={styles.tabletSidebarHeaderText}>
                        <Text style={styles.tabletSidebarTitle}>
                            {selectedAgent?.name ?? "Agentchat"}
                        </Text>
                        <AgentSwitcher
                            compact
                            onAgentChange={() => router.replace("/")}
                        />
                    </View>
                    <View style={styles.tabletSidebarHeaderActions}>
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
                        <TouchableOpacity
                            style={styles.tabletSidebarHeaderButton}
                            onPress={handleStartNewChat}
                            accessibilityRole="button"
                            accessibilityLabel="Start new chat"
                        >
                            <Feather
                                name="plus"
                                size={18}
                                color={colors.accent}
                            />
                        </TouchableOpacity>
                    </View>
                </View>
                {chats.length === 0 ? (
                    <View style={styles.tabletSidebarEmpty}>
                        <Text style={styles.tabletSidebarEmptyText}>
                            No chats yet
                        </Text>
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
            </View>
        );
    };

    const toggleThinking = (messageId: string) => {
        setExpandedThinking((prev) => ({
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
        const displayContent = item.content;
        const displayThinking = item.thinking;
        const isStreamingMessage = activeRun?.assistantMessageId === item.id;
        const showThinkingIndicator = false;
        const hideContentWhileReasoning = false;
        const showGenerating =
            isStreamingMessage &&
            !displayContent &&
            !displayThinking &&
            item.role === "assistant";
        const hasThinkingBadge =
            item.thinkingLevel !== undefined && item.thinkingLevel !== "none";
        const hasModelBadge = Boolean(item.modelId);
        const showDivider = hasThinkingBadge || hasModelBadge;
        const modelDisplayName = getModelDisplayName(item.modelId, models);

        return (
            <View
                style={[
                    styles.messageGroup,
                    isUser
                        ? styles.messageGroupUser
                        : styles.messageGroupAssistant,
                ]}
            >
                {displayThinking && (
                    <View
                        style={[
                            styles.thinkingPanel,
                            styles.thinkingPanelOutside,
                        ]}
                    >
                        <TouchableOpacity
                            style={styles.thinkingHeader}
                            onPress={() => toggleThinking(item.id)}
                            activeOpacity={0.7}
                        >
                            <Feather
                                name={
                                    expandedThinking[item.id]
                                        ? "chevron-down"
                                        : "chevron-right"
                                }
                                size={14}
                                color={colors.warning}
                                style={styles.thinkingChevron}
                            />
                            <MaterialCommunityIcons
                                name="brain"
                                size={14}
                                color={colors.warning}
                                style={styles.thinkingIcon}
                            />
                            <Text style={styles.thinkingLabel}>Reasoning</Text>
                            {showThinkingIndicator && (
                                <ActivityIndicator
                                    size="small"
                                    color={colors.warning}
                                    style={styles.thinkingIndicator}
                                />
                            )}
                        </TouchableOpacity>
                        {expandedThinking[item.id] && (
                            <View style={styles.thinkingContent}>
                                <Text style={styles.thinkingText}>
                                    {displayThinking}
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
                        ]}
                    >
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
                    <Text
                        style={[
                            styles.messageMetaText,
                            isUser && styles.messageMetaTextUser,
                        ]}
                    >
                        {formatMessageTime(item.createdAt)}
                    </Text>
                    {showDivider && <View style={styles.messageMetaDivider} />}
                    {hasThinkingBadge && (
                        <View
                            style={[styles.messageBadge, styles.thinkingBadge]}
                        >
                            <Text
                                style={[
                                    styles.messageBadgeText,
                                    styles.thinkingBadgeText,
                                ]}
                            >
                                {item.thinkingLevel?.toUpperCase()}
                            </Text>
                        </View>
                    )}
                    {hasModelBadge && (
                        <TouchableOpacity
                            style={[styles.messageBadge, styles.modelBadge]}
                            activeOpacity={0.7}
                            onPress={() =>
                                Alert.alert("Model", modelDisplayName)
                            }
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
                {isTwoPaneLayout ? (
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
            <View style={styles.header}>
                <View style={styles.headerLeft}>
                    {isTwoPaneLayout ? (
                        <View
                            style={[
                                styles.iconButton,
                                styles.backButtonPlaceholder,
                            ]}
                        />
                    ) : (
                        <TouchableOpacity
                            onPress={() => router.replace("/")}
                            style={[styles.iconButton, styles.backButton]}
                        >
                            <Feather
                                name="arrow-left"
                                size={20}
                                color={colors.accent}
                            />
                        </TouchableOpacity>
                    )}
                </View>
                <View style={styles.headerCenter}>
                    <Text style={styles.headerTitle} numberOfLines={1}>
                        {currentChat.title}
                    </Text>
                    <Text style={styles.headerSubtitle} numberOfLines={1}>
                        {selectedAgent?.name ?? "Agentchat"}
                    </Text>
                </View>
                <View style={styles.headerRight}>
                    <AgentSwitcher
                        compact
                        onAgentChange={() => router.replace("/")}
                    />
                    <TouchableOpacity
                        onPress={handleDeleteChat}
                        style={[styles.iconButton, styles.deleteButton]}
                    >
                        <Feather
                            name="trash-2"
                            size={20}
                            color={colors.danger}
                        />
                    </TouchableOpacity>
                </View>
            </View>

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
                            flatListRef.current?.scrollToEnd?.({
                                animated: true,
                            });
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
            {isTwoPaneLayout ? (
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
            justifyContent: "space-between",
            paddingHorizontal: 16,
            paddingVertical: 12,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
        },
        tabletSidebarHeaderText: {
            flex: 1,
            gap: 8,
            marginRight: 12,
        },
        tabletSidebarTitle: {
            fontSize: 20,
            fontWeight: "700",
            color: colors.text,
        },
        tabletSidebarHeaderActions: {
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
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
            paddingBottom: 24,
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
        },
        tabletSidebarEmptyText: {
            fontSize: 14,
            color: colors.textMuted,
            textAlign: "center",
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
        header: {
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 16,
            paddingVertical: 12,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
            backgroundColor: colors.surface,
        },
        headerLeft: {
            marginRight: 8,
        },
        headerCenter: {
            flex: 1,
            minWidth: 0,
            gap: 2,
        },
        headerRight: {
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            marginLeft: 8,
        },
        iconButton: {
            padding: 4,
        },
        backButton: {
            marginRight: 8,
        },
        backButtonPlaceholder: {
            width: 28,
            marginRight: 8,
        },
        headerTitle: {
            fontSize: 17,
            fontWeight: "600",
            color: colors.text,
        },
        headerSubtitle: {
            fontSize: 12,
            color: colors.textMuted,
        },
        deleteButton: {
            marginLeft: 0,
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
        thinkingBadge: {
            backgroundColor: colors.warningSoft,
            borderColor: colors.warningBorder,
        },
        thinkingBadgeText: {
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
        thinkingPanel: {
            marginTop: 8,
            borderWidth: 1,
            borderColor: colors.warningBorder,
            backgroundColor: colors.warningSoft,
            borderRadius: 8,
            overflow: "hidden",
        },
        thinkingPanelOutside: {
            marginTop: 6,
            marginBottom: 4,
            maxWidth: "85%",
        },
        thinkingHeader: {
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 12,
            paddingVertical: 8,
            backgroundColor: colors.warningSoft,
        },
        thinkingIndicator: {
            marginLeft: 8,
        },
        thinkingChevron: {
            marginRight: 6,
        },
        thinkingIcon: {
            marginRight: 6,
        },
        thinkingLabel: {
            fontSize: 12,
            fontWeight: "600",
            color: colors.warning,
            textTransform: "uppercase" as const,
            letterSpacing: 0.5,
        },
        thinkingContent: {
            paddingHorizontal: 12,
            paddingTop: 8,
            paddingBottom: 8,
            borderTopWidth: 1,
            borderTopColor: colors.warningBorder,
        },
        thinkingText: {
            fontSize: 13,
            color: colors.textMuted,
            lineHeight: 19,
        },
    });
