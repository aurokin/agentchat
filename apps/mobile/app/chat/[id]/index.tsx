import React, {
    useEffect,
    useState,
    useRef,
    useMemo,
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
    type NativeScrollEvent,
    type NativeSyntheticEvent,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useChatContext } from "../../../src/contexts/ChatContext";
import { useModelContext } from "../../../src/contexts/ModelContext";
import { useSkillsContext } from "../../../src/contexts/SkillsContext";
import { useTheme, type ThemeColors } from "../../../src/contexts/ThemeContext";
import {
    getApiKey,
    loadAttachmentData,
    saveAttachments,
    setDefaultModel,
    setDefaultThinking,
    setDefaultSearchLevel,
} from "../../../src/lib/storage";
import { getAttachment, getAttachmentsByMessage } from "../../../src/lib/db";
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
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import Markdown from "react-native-markdown-display";
import { MessageInput } from "../../../src/components/chat/MessageInput";
import { AttachmentGallery } from "../../../src/components/chat/AttachmentGallery";
import { v4 as uuidv4 } from "uuid";

const BrainIcon = ({ size }: { size: number }) => (
    <Text style={{ fontSize: size, lineHeight: size }}>🧠</Text>
);

interface ErrorState {
    message: string;
    isRetryable: boolean;
}

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
        selectChat,
        addMessage,
        updateMessage,
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
        setDefaultSkill,
    } = useSkillsContext();
    const { colors } = useTheme();
    const styles = useMemo(() => createStyles(colors), [colors]);

    const [inputText, setInputText] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [apiKey, setApiKey] = useState<string | null>(null);
    const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
    const [error, setError] = useState<ErrorState | null>(null);
    const [retryPayload, setRetryPayload] = useState<{
        content: string;
    } | null>(null);

    const flatListRef = useRef<FlatList<Message>>(null);
    const isAtBottomRef = useRef(true);
    const [streamingMessageId, setStreamingMessageId] = useState<string | null>(
        null,
    );
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

    useEffect(() => {
        if (chatId) {
            selectChat(chatId);
        }
    }, [chatId, selectChat]);

    useEffect(() => {
        const loadApiKey = async () => {
            const key = await getApiKey();
            setApiKey(key);
        };
        loadApiKey();
    }, []);

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
    const chatMessages = messages[chatId] || [];

    useEffect(() => {
        if (!currentChat) return;
        const nextSkill = getSkillSelectionUpdate({
            messageCount: chatMessages.length,
            defaultSkill,
            selectedSkill,
            selectedSkillMode,
        });
        if (nextSkill !== undefined) {
            setSelectedSkill(nextSkill, { mode: "auto" });
        }
    }, [
        chatMessages.length,
        currentChat,
        defaultSkill,
        selectedSkill,
        selectedSkillMode,
        setSelectedSkill,
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
        const updatedChat = { ...currentChat, thinking };
        await updateChat(updatedChat);
    };

    const handleSearchChange = async (searchLevel: SearchLevel) => {
        if (!currentChat) return;
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
        if (
            attachment.data.startsWith("file:") ||
            attachment.data.startsWith("/")
        ) {
            try {
                return await loadAttachmentData(attachment);
            } catch {
                return null;
            }
        }
        return attachment.data;
    };

    const buildOpenRouterMessages = async (
        messageList: Message[],
    ): Promise<OpenRouterMessage[]> => {
        const openRouterMessages: OpenRouterMessage[] = [];

        for (const message of messageList) {
            let content: MessageContent = message.contextContent;

            if (message.attachmentIds && message.attachmentIds.length > 0) {
                const attachments = getAttachmentsByMessage(message.id);
                if (attachments.length > 0) {
                    const attachmentsWithData = (
                        await Promise.all(
                            attachments.map(async (attachment) => {
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

        const skillForMessage = selectedSkill;
        if (skillForMessage) {
            setDefaultSkill(skillForMessage);
        }

        try {
            const activeModel = models.find(
                (model) => model.id === chatSnapshot.modelId,
            );
            const supportsReasoning = modelSupportsReasoning(activeModel);
            const supportsSearch = modelSupportsSearch(activeModel);

            await setDefaultModel(chatSnapshot.modelId);
            if (supportsReasoning) {
                await setDefaultThinking(chatSnapshot.thinking);
            }
            if (supportsSearch) {
                await setDefaultSearchLevel(chatSnapshot.searchLevel);
            }

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
                const saved = await saveAttachments(
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

            setSelectedSkill(null, { mode: "auto" });

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

            let streamingMessage: Message | null = await addMessage({
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

            let assistantContent = "";
            let assistantThinking = "";

            const updateStreamingMessage = (nextContent: string) => {
                if (!streamingMessage) return;
                const updated: Message = {
                    ...streamingMessage,
                    content: nextContent,
                    contextContent: nextContent,
                    thinking: assistantThinking || undefined,
                };
                streamingMessage = updated;
                void updateMessage(updated);
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
                    } else {
                        assistantContent += chunk;
                    }
                    updateStreamingMessage(assistantContent);
                },
            );

            const finalContent =
                assistantContent || response.choices[0]?.message?.content || "";
            const finalThinking =
                assistantThinking || response.choices[0]?.message?.thinking;

            if (streamingMessage) {
                const updated: Message = {
                    ...streamingMessage,
                    content: finalContent,
                    contextContent: finalContent,
                    thinking: finalThinking || undefined,
                    modelId: response.model ?? streamingMessage.modelId,
                };
                streamingMessage = updated;
                await updateMessage(updated);
            }
        } catch (err) {
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
        setInputText("");
        setAttachments([]);

        await handleSendMessage(content, pending);
    };

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
                        const attachment = getAttachment(id);
                        if (attachment) {
                            allAttachments.push(attachment);
                        }
                    }
                });
            }
        });

        return allAttachments;
    };

    const getMarkdownStyle = () => {
        return {
            body: {
                fontSize: 16,
                lineHeight: 22,
                color: colors.text,
            },
            code: {
                backgroundColor: colors.codeBackground,
                color: colors.text,
                paddingHorizontal: 4,
                paddingVertical: 2,
                borderRadius: 4,
                fontFamily: "monospace",
            },
            codeblock: {
                backgroundColor: colors.codeBackground,
                color: colors.text,
                padding: 12,
                borderRadius: 8,
                fontFamily: "monospace",
            },
            link: {
                color: colors.link,
                textDecorationLine: "underline" as const,
            },
        };
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
            .map((id) => getAttachment(id))
            .filter((a): a is Attachment => a !== undefined);

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
                        <Text style={styles.skillIcon}>✨</Text>
                        <Text style={styles.skillChevron}>
                            {isExpanded ? "▼" : "◀"}
                        </Text>
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
        const showThinkingIndicator =
            isStreamingMessage && !item.content && Boolean(item.thinking);
        const hideContentWhileReasoning =
            isStreamingMessage && Boolean(item.thinking) && !item.content;
        const showGenerating =
            isStreamingMessage && !item.content && !item.thinking;
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
                {item.thinking && (
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
                            <Text style={styles.thinkingIcon}>
                                {expandedThinking[item.id] ? "▼" : "▶"}
                            </Text>
                            <BrainIcon size={14} />
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
                                    {item.thinking}
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
                        ) : item.content ? (
                            <Markdown style={getMarkdownStyle()}>
                                {item.content}
                            </Markdown>
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
                    keyExtractor={(item) => item.id}
                    renderItem={renderMessage}
                    contentContainerStyle={styles.listContent}
                    style={styles.list}
                    keyboardShouldPersistTaps="handled"
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
                    onInputChange={setInputText}
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
                        setSelectedSkill(skill, { mode: "manual" })
                    }
                    attachments={attachments}
                    onAttachmentsChange={handleAttachmentsSelected}
                    onRemoveAttachment={handleRemoveAttachment}
                    sessionId={chatId}
                />
            </KeyboardAvoidingView>

            <AttachmentGallery
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
        content: {
            flex: 1,
        },
        list: {
            flex: 1,
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
            marginTop: 0,
            marginBottom: 8,
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
            marginLeft: "auto",
        },
        thinkingIcon: {
            fontSize: 10,
            color: colors.warning,
            marginRight: 6,
            width: 12,
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
            paddingBottom: 12,
            borderTopWidth: 1,
            borderTopColor: colors.warningBorder,
        },
        thinkingText: {
            fontSize: 12,
            color: colors.textMuted,
            lineHeight: 18,
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
            marginTop: 0,
            marginBottom: 8,
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
            fontSize: 12,
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
            fontSize: 12,
            color: colors.accent,
        },
        skillChevron: {
            fontSize: 12,
            color: colors.accent,
        },
        skillContent: {
            paddingHorizontal: 12,
            paddingTop: 8,
            paddingBottom: 12,
            borderTopWidth: 1,
            borderTopColor: colors.accentBorder,
        },
        skillDescription: {
            fontSize: 11,
            color: colors.textMuted,
            marginBottom: 8,
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
            fontSize: 11,
            lineHeight: 16,
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
