import React, {
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
    Image,
    Alert,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    Dimensions,
    type NativeScrollEvent,
    type NativeSyntheticEvent,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useChatContext } from "@/contexts/ChatContext";
import { useModelContext } from "@/contexts/ModelContext";
import { useSkillsContext } from "@/contexts/SkillsContext";
import { useTheme, type ThemeColors } from "@/contexts/ThemeContext";
import { loadAttachmentData, saveFile } from "@/lib/storage";
import { useApiKey } from "@/hooks/useApiKey";
import { useStorageAdapter } from "@/contexts/SyncContext";
import {
    sendMessage,
    buildMessageContent,
    OpenRouterApiErrorImpl,
    type OpenRouterMessage,
    type MessageContent,
} from "@shared/core/openrouter";
import {
    modelSupportsReasoning,
    modelSupportsSearch,
    type OpenRouterModel,
} from "@shared/core/models";
import type {
    ChatSession,
    Message,
    ThinkingLevel,
    SearchLevel,
    Attachment,
    PendingAttachment,
} from "@shared/core/types";
import { type Skill, getSkillSelectionUpdate } from "@shared/core/skills";
import {
    applyModelCapabilities,
    getLastUserSettings,
    resolveInitialChatSettings,
} from "@shared/core/defaults";
import { trimTrailingEmptyLines } from "@shared/core/text";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { MessageInput } from "@/components/chat/MessageInput";
import { AttachmentGallery } from "@/components/chat/AttachmentGallery";
import { MarkdownRenderer } from "@/components/chat/MarkdownRenderer";
import { v4 as uuidv4 } from "uuid";

interface ErrorState {
    message: string;
    isRetryable: boolean;
}

const EMPTY_MESSAGES: Message[] = [];

interface StreamingDraft {
    id: string;
    content: string;
    thinking: string;
    hasReceivedChunk: boolean;
    isThinkingStreaming: boolean;
}

const THINKING_STREAM_TIMEOUT_MS = 800;

const getChatTitleUpdate = (
    chat: ChatSession | null,
    content: string,
    messageCount: number,
): ChatSession | null => {
    if (!chat || chat.title !== "New Chat" || messageCount !== 0) {
        return null;
    }

    const title = content.slice(0, 50) + (content.length > 50 ? "..." : "");
    return { ...chat, title };
};

export default function ChatScreen(): ReactElement {
    const params = useLocalSearchParams();
    const router = useRouter();
    const chatId = params.id as string;
    const {
        currentChat,
        messages,
        defaultModel,
        defaultThinking,
        defaultSearchLevel,
        setDefaultThinking,
        setDefaultSearchLevel,
        selectChat,
        addMessage,
        updateMessage,
        createChat,
        deleteChat,
        updateChat,
    } = useChatContext();
    const {
        models,
        selectModel: setSelectedModel,
        favoriteModels,
        toggleFavoriteModel,
    } = useModelContext();
    const {
        skills,
        selectedSkill,
        defaultSkill,
        selectedSkillMode,
        setSelectedSkill,
    } = useSkillsContext();
    const { colors } = useTheme();
    const styles = useMemo(() => createStyles(colors), [colors]);

    const [inputText, setInputText] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const { apiKey } = useApiKey();
    const storageAdapter = useStorageAdapter();
    const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
    const [attachmentsById, setAttachmentsById] = useState<
        Record<string, Attachment>
    >({});
    const [error, setError] = useState<ErrorState | null>(null);
    const [retryPayload, setRetryPayload] = useState<{
        content: string;
    } | null>(null);

    const flatListRef = useRef<FlatList<Message>>(null);
    const isAtBottomRef = useRef(true);
    const [streamingMessageId, setStreamingMessageId] = useState<string | null>(
        null,
    );
    const [streamingDraft, setStreamingDraft] = useState<StreamingDraft | null>(
        null,
    );
    const thinkingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
        null,
    );
    const inputSuppressionTimeoutRef = useRef<ReturnType<
        typeof setTimeout
    > | null>(null);
    const [expandedThinking, setExpandedThinking] = useState<
        Record<string, boolean>
    >({});
    const [expandedSkill, setExpandedSkill] = useState<Record<string, boolean>>(
        {},
    );
    const [galleryVisible, setGalleryVisible] = useState(false);
    const [galleryAttachments, setGalleryAttachments] = useState<Attachment[]>(
        [],
    );
    const [galleryInitialIndex, setGalleryInitialIndex] = useState(0);
    const screenWidth = Dimensions.get("window").width;
    const lastSkillChangeRef = useRef<{
        skill: Skill | null;
        mode: "auto" | "manual";
    }>({
        skill: selectedSkill,
        mode: selectedSkillMode,
    });
    const lastInitializedChatIdRef = useRef<string | null>(null);
    const suppressInputRef = useRef(false);

    const updateSelectedSkill = useCallback(
        (skill: Skill | null, options?: { mode?: "auto" | "manual" }) => {
            const mode = options?.mode ?? "manual";
            lastSkillChangeRef.current = { skill, mode };
            setSelectedSkill(skill, { mode });
        },
        [setSelectedSkill],
    );

    useEffect(() => {
        if (chatId) {
            selectChat(chatId);
        }
    }, [chatId, selectChat]);

    useEffect(() => {
        return () => {
            if (thinkingTimeoutRef.current) {
                clearTimeout(thinkingTimeoutRef.current);
            }
            if (inputSuppressionTimeoutRef.current) {
                clearTimeout(inputSuppressionTimeoutRef.current);
            }
        };
    }, []);

    useEffect(() => {
        lastSkillChangeRef.current = {
            skill: selectedSkill,
            mode: selectedSkillMode,
        };
    }, [selectedSkill, selectedSkillMode]);

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
    const searchSupported = modelSupportsSearch(currentModel);
    const chatMessages = useMemo(() => {
        if (!chatId) return EMPTY_MESSAGES;
        return messages[chatId] ?? EMPTY_MESSAGES;
    }, [chatId, messages]);
    const hasLoadedMessages = Boolean(chatId && messages[chatId] !== undefined);
    const showSkeletons = !hasLoadedMessages;
    const showEmptyState = hasLoadedMessages && chatMessages.length === 0;

    useEffect(() => {
        let isMounted = true;
        const loadAttachments = async () => {
            const nextById: Record<string, Attachment> = {};

            for (const message of chatMessages) {
                if (
                    !message.attachmentIds ||
                    message.attachmentIds.length === 0
                ) {
                    continue;
                }
                const attachmentsForMessage =
                    await storageAdapter.getAttachmentsByMessage(message.id);
                for (const attachment of attachmentsForMessage) {
                    nextById[attachment.id] = attachment;
                }
            }

            if (isMounted) {
                setAttachmentsById(nextById);
            }
        };

        void loadAttachments();

        return () => {
            isMounted = false;
        };
    }, [chatMessages, storageAdapter]);

    useEffect(() => {
        if (!currentChat || !hasLoadedMessages) return;
        const nextSkill = getSkillSelectionUpdate({
            messageCount: chatMessages.length,
            defaultSkill,
            selectedSkill,
            selectedSkillMode,
        });
        if (nextSkill !== undefined) {
            updateSelectedSkill(nextSkill, { mode: "auto" });
        }
    }, [
        chatMessages.length,
        currentChat,
        hasLoadedMessages,
        defaultSkill,
        selectedSkill,
        selectedSkillMode,
        updateSelectedSkill,
    ]);

    useEffect(() => {
        if (!currentChat || !hasLoadedMessages) return;
        if (lastInitializedChatIdRef.current === currentChat.id) return;
        const defaults = {
            modelId: defaultModel,
            thinking: defaultThinking,
            searchLevel: defaultSearchLevel,
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
            supportsSearch: modelForSettings
                ? modelSupportsSearch(modelForSettings)
                : true,
        });

        if (
            constrainedSettings.modelId !== currentChat.modelId ||
            constrainedSettings.thinking !== currentChat.thinking ||
            constrainedSettings.searchLevel !== currentChat.searchLevel
        ) {
            void updateChat({
                ...currentChat,
                modelId: constrainedSettings.modelId,
                thinking: constrainedSettings.thinking,
                searchLevel: constrainedSettings.searchLevel,
            });
        }
        lastInitializedChatIdRef.current = currentChat.id;
    }, [
        chatMessages,
        currentChat,
        defaultModel,
        defaultThinking,
        defaultSearchLevel,
        hasLoadedMessages,
        models,
        updateChat,
    ]);

    useEffect(() => {
        if (!currentChat || !currentModel) return;
        const nextThinking = reasoningSupported ? currentChat.thinking : "none";
        const nextSearchLevel = searchSupported
            ? currentChat.searchLevel
            : "none";
        if (
            nextThinking !== currentChat.thinking ||
            nextSearchLevel !== currentChat.searchLevel
        ) {
            void updateChat({
                ...currentChat,
                thinking: nextThinking,
                searchLevel: nextSearchLevel,
            });
        }
    }, [
        currentChat,
        currentModel,
        reasoningSupported,
        searchSupported,
        updateChat,
    ]);

    const handleModelChange = async (modelId: string) => {
        if (!currentChat) return;
        await setSelectedModel(modelId);
        const nextModel = models.find((model) => model.id === modelId);
        const nextThinking = nextModel
            ? modelSupportsReasoning(nextModel)
                ? currentChat.thinking
                : "none"
            : currentChat.thinking;
        const nextSearchLevel = nextModel
            ? modelSupportsSearch(nextModel)
                ? currentChat.searchLevel
                : "none"
            : currentChat.searchLevel;
        const updatedChat = {
            ...currentChat,
            modelId,
            thinking: nextThinking,
            searchLevel: nextSearchLevel,
        };
        await updateChat(updatedChat);
    };

    const handleThinkingChange = async (thinking: ThinkingLevel) => {
        if (!currentChat) return;
        setDefaultThinking(thinking);
        const updatedChat = { ...currentChat, thinking };
        await updateChat(updatedChat);
    };

    const handleSearchChange = async (searchLevel: SearchLevel) => {
        if (!currentChat) return;
        setDefaultSearchLevel(searchLevel);
        const updatedChat = { ...currentChat, searchLevel };
        await updateChat(updatedChat);
    };

    const handleAttachmentsSelected = (newAttachments: PendingAttachment[]) => {
        setAttachments((prev) => [...prev, ...newAttachments]);
    };

    const handleRemoveAttachment = (attachmentId: string) => {
        setAttachments((prev) => prev.filter((a) => a.id !== attachmentId));
    };

    const getAttachmentBase64 = async (
        attachment: Attachment,
    ): Promise<string | null> => {
        if (attachment.data.startsWith("data:")) {
            return attachment.data.split(",")[1] ?? "";
        }
        if (attachment.data.startsWith("file://")) {
            try {
                return await loadAttachmentData(attachment);
            } catch {
                return null;
            }
        }
        return attachment.data;
    };

    const savePendingAttachmentsToStorage = useCallback(
        async (pending: PendingAttachment[], messageId: string) => {
            const createdAt = Date.now();
            const saved: Attachment[] = [];

            for (const pendingAttachment of pending) {
                const fileUri = await saveFile(pendingAttachment.data, {
                    id: pendingAttachment.id,
                    mimeType: pendingAttachment.mimeType,
                    width: pendingAttachment.width,
                    height: pendingAttachment.height,
                });

                saved.push({
                    id: pendingAttachment.id,
                    messageId,
                    type: "image",
                    mimeType: pendingAttachment.mimeType,
                    data: fileUri,
                    width: pendingAttachment.width,
                    height: pendingAttachment.height,
                    size: pendingAttachment.size,
                    createdAt,
                });
            }

            await storageAdapter.saveAttachments(saved);
            return saved;
        },
        [storageAdapter],
    );

    const buildOpenRouterMessages = async (
        messageList: Message[],
    ): Promise<OpenRouterMessage[]> => {
        const openRouterMessages: OpenRouterMessage[] = [];

        for (const message of messageList) {
            let content: MessageContent = message.contextContent;

            if (message.attachmentIds && message.attachmentIds.length > 0) {
                const attachments =
                    await storageAdapter.getAttachmentsByMessage(message.id);
                if (attachments.length > 0) {
                    const attachmentsWithData = (
                        await Promise.all(
                            attachments.map(async (attachment: Attachment) => {
                                const data =
                                    await getAttachmentBase64(attachment);
                                if (!data) return null;
                                return { ...attachment, data };
                            }),
                        )
                    ).filter((attachment): attachment is Attachment =>
                        Boolean(attachment),
                    );

                    if (attachmentsWithData.length > 0) {
                        content = buildMessageContent(
                            message.contextContent,
                            attachmentsWithData,
                        );
                    }
                }
            }

            openRouterMessages.push({
                role: message.role,
                content,
            });
        }

        return openRouterMessages;
    };

    const handleSendMessage = async (
        content: string,
        pendingAttachments?: PendingAttachment[],
    ) => {
        const chatSnapshot = currentChat;
        const messagesSnapshot = [...chatMessages];
        let streamingMessage: Message | null = null;
        let assistantContent = "";
        let assistantThinking = "";

        if (!apiKey) {
            setError({
                message: "Please add your OpenRouter API key in Settings",
                isRetryable: false,
            });
            setRetryPayload(null);
            return;
        }

        if (!chatSnapshot) {
            setError({ message: "No chat selected", isRetryable: false });
            setRetryPayload(null);
            return;
        }

        setIsLoading(true);
        setError(null);
        setRetryPayload(null);
        setStreamingMessageId(null);
        setStreamingDraft(null);

        const skillSnapshot = lastSkillChangeRef.current;
        let skillForMessage = selectedSkill;
        if (skillSnapshot.mode === "manual") {
            skillForMessage = skillSnapshot.skill;
        }

        try {
            const activeModel = models.find(
                (model) => model.id === chatSnapshot.modelId,
            );
            const supportsReasoning = modelSupportsReasoning(activeModel);
            const supportsSearch = modelSupportsSearch(activeModel);

            const effectiveThinking = supportsReasoning
                ? chatSnapshot.thinking
                : "none";
            const effectiveSearchLevel =
                supportsSearch && chatSnapshot.searchLevel !== "none"
                    ? chatSnapshot.searchLevel
                    : "none";

            const contextContent = skillForMessage
                ? `${skillForMessage.prompt}\n\nUser: ${content}`
                : content;

            const clonedSkill = skillForMessage
                ? { ...skillForMessage, createdAt: Date.now() }
                : null;

            const messageId = uuidv4();
            let attachmentIds: string[] | undefined;

            if (pendingAttachments && pendingAttachments.length > 0) {
                const saved = await savePendingAttachmentsToStorage(
                    pendingAttachments,
                    messageId,
                );
                attachmentIds = saved.map((attachment) => attachment.id);
            }

            await addMessage({
                id: messageId,
                sessionId: chatSnapshot.id,
                role: "user",
                content: content,
                contextContent: contextContent,
                skill: clonedSkill,
                modelId: chatSnapshot.modelId,
                thinkingLevel: effectiveThinking,
                searchLevel: effectiveSearchLevel,
                attachmentIds,
            });

            void setSelectedModel(chatSnapshot.modelId);
            if (supportsReasoning) {
                setDefaultThinking(effectiveThinking);
            }
            if (supportsSearch) {
                setDefaultSearchLevel(effectiveSearchLevel);
            }

            updateSelectedSkill(null, { mode: "auto" });

            const updatedChat = getChatTitleUpdate(
                chatSnapshot,
                content,
                messagesSnapshot.length,
            );
            if (updatedChat) {
                await updateChat(updatedChat);
            }

            const openRouterMessages =
                await buildOpenRouterMessages(messagesSnapshot);

            const newUserAttachments = pendingAttachments?.length
                ? pendingAttachments.map((attachment) => ({
                      id: attachment.id,
                      messageId,
                      type: "image" as const,
                      mimeType: attachment.mimeType,
                      data: attachment.data,
                      width: attachment.width,
                      height: attachment.height,
                      size: attachment.size,
                      createdAt: Date.now(),
                  }))
                : undefined;

            openRouterMessages.push({
                role: "user",
                content: newUserAttachments
                    ? buildMessageContent(contextContent, newUserAttachments)
                    : contextContent,
            });

            streamingMessage = await addMessage({
                sessionId: chatSnapshot.id,
                role: "assistant",
                content: "",
                contextContent: "",
                thinking: undefined,
                modelId: chatSnapshot.modelId,
                skill: null,
                thinkingLevel: effectiveThinking,
                searchLevel: effectiveSearchLevel,
            });
            setStreamingMessageId(streamingMessage.id);
            setStreamingDraft({
                id: streamingMessage.id,
                content: "",
                thinking: "",
                hasReceivedChunk: false,
                isThinkingStreaming: false,
            });

            const streamingId = streamingMessage.id;
            const updateDraft = (
                updater: (draft: StreamingDraft) => StreamingDraft,
            ) => {
                setStreamingDraft((prev) => {
                    if (!prev || prev.id !== streamingId) return prev;
                    return updater(prev);
                });
            };

            const markThinkingStreaming = (delta: string) => {
                updateDraft((draft) => ({
                    ...draft,
                    thinking: draft.thinking + delta,
                    hasReceivedChunk: true,
                    isThinkingStreaming: true,
                }));
                if (thinkingTimeoutRef.current) {
                    clearTimeout(thinkingTimeoutRef.current);
                }
                thinkingTimeoutRef.current = setTimeout(() => {
                    setStreamingDraft((prev) => {
                        if (!prev || prev.id !== streamingId) return prev;
                        return { ...prev, isThinkingStreaming: false };
                    });
                }, THINKING_STREAM_TIMEOUT_MS);
            };

            const appendContent = (delta: string) => {
                updateDraft((draft) => ({
                    ...draft,
                    content: draft.content + delta,
                    hasReceivedChunk: true,
                }));
            };

            const response = await sendMessage(
                apiKey,
                openRouterMessages,
                {
                    id: chatSnapshot.id,
                    modelId: chatSnapshot.modelId,
                    thinking: effectiveThinking,
                    searchLevel: effectiveSearchLevel,
                },
                activeModel,
                (chunk: string, thinking?: string) => {
                    if (thinking !== undefined) {
                        assistantThinking += thinking;
                        markThinkingStreaming(thinking);
                    } else {
                        assistantContent += chunk;
                        appendContent(chunk);
                    }
                },
            );

            const finalContent =
                assistantContent || response.choices[0]?.message?.content || "";
            const finalThinking =
                assistantThinking || response.choices[0]?.message?.thinking;
            const trimmedContent = trimTrailingEmptyLines(finalContent) ?? "";
            const trimmedThinking = trimTrailingEmptyLines(finalThinking);

            if (streamingMessage) {
                const updated: Message = {
                    ...streamingMessage,
                    content: trimmedContent,
                    contextContent: trimmedContent,
                    thinking: trimmedThinking || undefined,
                    modelId: response.model ?? streamingMessage.modelId,
                };
                streamingMessage = updated;
                await updateMessage(updated);
            }
        } catch (err) {
            if (streamingMessage && (assistantContent || assistantThinking)) {
                const updated: Message = {
                    ...streamingMessage,
                    content: assistantContent,
                    contextContent: assistantContent,
                    thinking: assistantThinking || undefined,
                };
                streamingMessage = updated;
                await updateMessage(updated);
            }
            if (err instanceof OpenRouterApiErrorImpl) {
                setError({
                    message: err.message,
                    isRetryable: err.isRetryable,
                });
                if (err.isRetryable) {
                    setRetryPayload({ content });
                }
            } else {
                const message =
                    err instanceof Error
                        ? err.message
                        : "Failed to send message";
                setError({ message, isRetryable: true });
                setRetryPayload({ content });
            }
        } finally {
            setIsLoading(false);
            setStreamingMessageId(null);
            setStreamingDraft(null);
            if (thinkingTimeoutRef.current) {
                clearTimeout(thinkingTimeoutRef.current);
                thinkingTimeoutRef.current = null;
            }
        }
    };

    const handleSend = async () => {
        if (
            (!inputText.trim() && attachments.length === 0) ||
            isLoading ||
            !currentChat
        )
            return;

        const content = inputText.trim();
        const pending = attachments;
        if (inputSuppressionTimeoutRef.current) {
            clearTimeout(inputSuppressionTimeoutRef.current);
        }
        suppressInputRef.current = true;
        setInputText("");
        setAttachments([]);
        inputSuppressionTimeoutRef.current = setTimeout(() => {
            suppressInputRef.current = false;
            inputSuppressionTimeoutRef.current = null;
        }, 250);

        await handleSendMessage(content, pending);
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

    const handleDeleteChat = async () => {
        if (chatMessages.length > 0) {
            Alert.alert(
                "Delete Chat",
                "This chat has messages. Delete it and all attachments?",
                [
                    { text: "Cancel", style: "cancel" },
                    {
                        text: "Delete",
                        style: "destructive",
                        onPress: () => {
                            void (async () => {
                                await deleteChat(chatId);
                                router.replace("/");
                            })();
                        },
                    },
                ],
            );
            return;
        }

        await deleteChat(chatId);
        router.replace("/");
    };

    const handleManageStorage = () => {
        router.replace("/");
    };

    const handleStartNewChat = async () => {
        const chat = await createChat();
        router.replace(`/chat/${chat.id}`);
    };

    const toggleThinking = (messageId: string) => {
        setExpandedThinking((prev) => ({
            ...prev,
            [messageId]: !prev[messageId],
        }));
    };

    const toggleSkill = (messageId: string) => {
        setExpandedSkill((prev) => ({
            ...prev,
            [messageId]: !prev[messageId],
        }));
    };

    const openGallery = (attachmentId: string, attachments: Attachment[]) => {
        const index = attachments.findIndex((a) => a.id === attachmentId);
        if (index >= 0) {
            setGalleryAttachments(attachments);
            setGalleryInitialIndex(index);
            setGalleryVisible(true);
        }
    };

    const getChatAttachments = (): Attachment[] => {
        const allAttachments: Attachment[] = [];
        const seenIds = new Set<string>();

        chatMessages.forEach((message) => {
            if (message.attachmentIds) {
                message.attachmentIds.forEach((id) => {
                    if (!seenIds.has(id)) {
                        seenIds.add(id);
                        const attachment = attachmentsById[id];
                        if (attachment) {
                            allAttachments.push(attachment);
                        }
                    }
                });
            }
        });

        return allAttachments;
    };

    const formatFileSize = (bytes: number): string => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    const renderAttachmentThumbnail = (attachment: Attachment) => {
        const aspectRatio =
            attachment.width && attachment.height
                ? attachment.width / attachment.height
                : 1;
        const thumbnailSize = 80;
        const thumbnailWidth = thumbnailSize;
        const thumbnailHeight = thumbnailSize / aspectRatio;

        return (
            <TouchableOpacity
                key={attachment.id}
                style={styles.attachmentThumbnailContainer}
                onPress={() => openGallery(attachment.id, getChatAttachments())}
                activeOpacity={0.7}
            >
                <Image
                    source={{ uri: attachment.data }}
                    style={[
                        styles.attachmentThumbnail,
                        { width: thumbnailWidth, height: thumbnailHeight },
                    ]}
                    resizeMode="cover"
                />
                <View style={styles.attachmentMetadata}>
                    <Text style={styles.attachmentDimension}>
                        {attachment.width} × {attachment.height}
                    </Text>
                    <Text style={styles.attachmentSize}>
                        {formatFileSize(attachment.size)}
                    </Text>
                </View>
            </TouchableOpacity>
        );
    };

    const renderAttachments = (
        attachmentIds: string[],
        containerStyle?: object,
    ) => {
        if (!attachmentIds || attachmentIds.length === 0) return null;

        const attachments = attachmentIds
            .map((id) => attachmentsById[id])
            .filter((a): a is Attachment => Boolean(a && a.data));

        if (attachments.length === 0) return null;

        return (
            <View style={[styles.attachmentsContainer, containerStyle]}>
                {attachments.map(renderAttachmentThumbnail)}
            </View>
        );
    };

    const renderSkillInfo = (skill: Skill, messageId: string) => {
        const isExpanded = expandedSkill[messageId];

        return (
            <View style={[styles.skillPanel, styles.skillPanelOutside]}>
                <TouchableOpacity
                    style={[
                        styles.skillHeader,
                        isExpanded && styles.skillHeaderExpanded,
                    ]}
                    onPress={() => toggleSkill(messageId)}
                    activeOpacity={0.7}
                >
                    <Text
                        style={[
                            styles.skillName,
                            isExpanded && styles.skillNameExpanded,
                        ]}
                        numberOfLines={1}
                    >
                        {skill.name}
                    </Text>
                    <View style={styles.skillHeaderIcons}>
                        <Feather
                            name="award"
                            size={12}
                            color={colors.accent}
                            style={styles.skillIcon}
                        />
                        <Feather
                            name={isExpanded ? "chevron-down" : "chevron-left"}
                            size={14}
                            color={colors.accent}
                            style={styles.skillChevron}
                        />
                    </View>
                </TouchableOpacity>
                {isExpanded && (
                    <View style={styles.skillContent}>
                        {skill.description && (
                            <Text
                                style={[
                                    styles.skillDescription,
                                    isExpanded &&
                                        styles.skillDescriptionExpanded,
                                ]}
                            >
                                {skill.description}
                            </Text>
                        )}
                        <View style={styles.skillPromptBox}>
                            <ScrollView
                                style={styles.skillPromptScroll}
                                contentContainerStyle={
                                    styles.skillPromptContent
                                }
                                nestedScrollEnabled
                                showsVerticalScrollIndicator
                            >
                                <Text style={styles.skillPromptText}>
                                    {skill.prompt}
                                </Text>
                            </ScrollView>
                        </View>
                    </View>
                )}
            </View>
        );
    };

    const formatMessageTime = (timestamp: number): string => {
        return new Date(timestamp).toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit",
        });
    };

    const getSearchBadgeLabel = (level: SearchLevel): string => {
        if (level === "low") return "WEB-3";
        if (level === "medium") return "WEB-6";
        if (level === "high") return "WEB-10";
        return "WEB";
    };

    const getModelDisplayName = (
        modelId: string | undefined,
        modelList: OpenRouterModel[],
    ): string => {
        if (!modelId) return "Unknown model";
        const model = modelList.find((entry) => entry.id === modelId);
        if (model?.name) return model.name;
        const parts = modelId.split("/");
        return parts.length > 1 ? parts[1] : modelId;
    };

    const renderMessage = ({ item }: { item: Message }) => {
        const isUser = item.role === "user";
        const isStreamingMessage = isLoading && streamingMessageId === item.id;
        const draft =
            isStreamingMessage && streamingDraft?.id === item.id
                ? streamingDraft
                : null;
        const displayContent = draft ? draft.content : item.content;
        const displayThinking = draft
            ? draft.thinking || item.thinking
            : item.thinking;
        const hasReceivedChunk = draft
            ? draft.hasReceivedChunk
            : Boolean(item.content || item.thinking);
        const showThinkingIndicator =
            isStreamingMessage &&
            Boolean(displayThinking) &&
            (draft?.isThinkingStreaming ?? !displayContent);
        const hideContentWhileReasoning =
            isStreamingMessage && Boolean(displayThinking) && !displayContent;
        const showGenerating = isStreamingMessage && !hasReceivedChunk;
        const hasSearchBadge =
            item.searchLevel !== undefined && item.searchLevel !== "none";
        const hasThinkingBadge =
            item.thinkingLevel !== undefined && item.thinkingLevel !== "none";
        const hasModelBadge = Boolean(item.modelId);
        const showDivider = hasSearchBadge || hasThinkingBadge || hasModelBadge;
        const modelDisplayName = getModelDisplayName(item.modelId, models);
        const hasAttachments =
            item.attachmentIds !== undefined && item.attachmentIds.length > 0;

        return (
            <View
                style={[
                    styles.messageGroup,
                    isUser
                        ? styles.messageGroupUser
                        : styles.messageGroupAssistant,
                ]}
            >
                {item.skill && item.role === "user"
                    ? renderSkillInfo(item.skill, item.id)
                    : null}
                {isUser && hasAttachments
                    ? renderAttachments(
                          item.attachmentIds as string[],
                          styles.attachmentsBeforeContent,
                      )
                    : null}
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
                        {!isUser &&
                            hasAttachments &&
                            renderAttachments(item.attachmentIds as string[])}
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
                    {hasSearchBadge && (
                        <View
                            style={[
                                styles.messageBadge,
                                isUser
                                    ? styles.searchBadgeUser
                                    : styles.searchBadge,
                            ]}
                        >
                            <Text
                                style={[
                                    styles.messageBadgeText,
                                    isUser
                                        ? styles.searchBadgeTextUser
                                        : styles.searchBadgeText,
                                ]}
                            >
                                {getSearchBadgeLabel(
                                    item.searchLevel as SearchLevel,
                                )}
                            </Text>
                        </View>
                    )}
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
                <ActivityIndicator size="large" color={colors.accent} />
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
            <View style={styles.header}>
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
                <Text style={styles.headerTitle} numberOfLines={1}>
                    {currentChat.title}
                </Text>
                <TouchableOpacity
                    onPress={handleDeleteChat}
                    style={[styles.iconButton, styles.deleteButton]}
                >
                    <Feather name="trash-2" size={20} color={colors.danger} />
                </TouchableOpacity>
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

            <KeyboardAvoidingView
                behavior={Platform.OS === "ios" ? "padding" : "height"}
                style={styles.content}
            >
                <FlatList
                    ref={flatListRef}
                    data={chatMessages}
                    extraData={{
                        streamingDraft,
                        streamingMessageId,
                        isLoading,
                    }}
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
                    isLoading={isLoading}
                    models={models}
                    selectedModelId={currentChat.modelId}
                    onModelChange={handleModelChange}
                    favoriteModels={favoriteModels}
                    onToggleFavoriteModel={toggleFavoriteModel}
                    reasoningSupported={reasoningSupported}
                    thinkingLevel={currentChat.thinking}
                    onThinkingChange={handleThinkingChange}
                    searchSupported={searchSupported}
                    searchLevel={currentChat.searchLevel}
                    onSearchChange={handleSearchChange}
                    skills={skills}
                    selectedSkill={selectedSkill}
                    onSkillSelect={(skill) =>
                        updateSelectedSkill(skill, { mode: "manual" })
                    }
                    attachments={attachments}
                    onAttachmentsChange={handleAttachmentsSelected}
                    onRemoveAttachment={handleRemoveAttachment}
                    sessionId={chatId}
                    onManageStorage={handleManageStorage}
                    onStartNewChat={handleStartNewChat}
                />
            </KeyboardAvoidingView>

            <AttachmentGallery
                key={`${galleryVisible}-${galleryInitialIndex}-${galleryAttachments.length}`}
                visible={galleryVisible}
                attachments={galleryAttachments}
                initialIndex={galleryInitialIndex}
                onClose={() => setGalleryVisible(false)}
            />
        </SafeAreaView>
    );
}

const createStyles = (colors: ThemeColors) =>
    StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: colors.background,
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
        iconButton: {
            padding: 4,
        },
        backButton: {
            marginRight: 8,
        },
        headerTitle: {
            flex: 1,
            fontSize: 17,
            fontWeight: "600",
            color: colors.text,
        },
        deleteButton: {
            marginLeft: 8,
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
        skillPanel: {
            marginTop: 8,
            borderWidth: 1,
            borderColor: colors.accentBorder,
            backgroundColor: colors.accentSoft,
            borderRadius: 8,
            overflow: "hidden",
        },
        skillPanelOutside: {
            marginTop: 6,
            marginBottom: 4,
            maxWidth: "85%",
        },
        skillHeader: {
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 12,
            paddingVertical: 8,
            backgroundColor: colors.accentSoft,
        },
        skillHeaderExpanded: {
            justifyContent: "flex-end",
        },
        skillName: {
            fontSize: 13,
            fontWeight: "600",
            color: colors.accent,
            flexShrink: 1,
            marginRight: 8,
        },
        skillNameExpanded: {
            textAlign: "right",
        },
        skillHeaderIcons: {
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
        },
        skillIcon: {
            marginTop: 1,
        },
        skillChevron: {
            marginTop: 1,
        },
        skillContent: {
            paddingHorizontal: 12,
            paddingTop: 10,
            paddingBottom: 8,
            borderTopWidth: 1,
            borderTopColor: colors.accentBorder,
        },
        skillDescription: {
            fontSize: 12,
            lineHeight: 16,
            color: colors.textMuted,
            marginBottom: 6,
        },
        skillDescriptionExpanded: {
            textAlign: "right",
        },
        skillPromptBox: {
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surfaceSubtle,
            borderRadius: 6,
            overflow: "hidden",
        },
        skillPromptScroll: {
            maxHeight: 160,
        },
        skillPromptContent: {
            padding: 8,
        },
        skillPromptText: {
            fontSize: 12,
            lineHeight: 18,
            color: colors.text,
            fontFamily: "monospace",
        },
        attachmentsContainer: {
            marginTop: 8,
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 8,
        },
        attachmentsBeforeContent: {
            marginTop: 0,
            marginBottom: 8,
        },
        attachmentThumbnailContainer: {
            alignItems: "flex-start",
            gap: 4,
        },
        attachmentThumbnail: {
            borderRadius: 8,
            backgroundColor: colors.surfaceSubtle,
        },
        attachmentMetadata: {
            paddingHorizontal: 4,
            paddingVertical: 2,
        },
        attachmentDimension: {
            fontSize: 10,
            color: colors.textMuted,
        },
        attachmentSize: {
            fontSize: 10,
            color: colors.textSubtle,
        },
        attachmentImage: {
            borderRadius: 8,
            backgroundColor: colors.surfaceSubtle,
        },
    });
