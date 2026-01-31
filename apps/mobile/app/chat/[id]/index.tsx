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
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useChatContext } from "../../../src/contexts/ChatContext";
import { useModelContext } from "../../../src/contexts/ModelContext";
import { useSkillsContext } from "../../../src/contexts/SkillsContext";
import { useTheme, type ThemeColors } from "../../../src/contexts/ThemeContext";
import {
    getApiKey,
    setDefaultThinking,
    setDefaultSearchLevel,
} from "../../../src/lib/storage";
import { getAttachment, saveAttachment } from "../../../src/lib/db";
import { sendMessage } from "@shared/core/openrouter";
import {
    modelSupportsReasoning,
    modelSupportsSearch,
} from "@shared/core/models";
import type {
    ChatSession,
    Message,
    ThinkingLevel,
    SearchLevel,
    Attachment,
} from "@shared/core/types";
import type { Skill } from "@shared/core/skills";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import Markdown from "react-native-markdown-display";
import { MessageInput } from "../../../src/components/chat/MessageInput";
import { AttachmentGallery } from "../../../src/components/chat/AttachmentGallery";

const BrainIcon = ({ size }: { size: number }) => (
    <Text style={{ fontSize: size, lineHeight: size }}>🧠</Text>
);

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
        deleteChat,
        updateChat,
    } = useChatContext();
    const {
        models,
        selectModel: setSelectedModel,
        favoriteModels,
        toggleFavoriteModel,
    } = useModelContext();
    const { skills, selectedSkill, setSelectedSkill } = useSkillsContext();
    const { colors } = useTheme();
    const styles = useMemo(() => createStyles(colors), [colors]);

    const [inputText, setInputText] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [apiKey, setApiKey] = useState<string | null>(null);
    const [attachments, setAttachments] = useState<Attachment[]>([]);

    const flatListRef = useRef<FlatList<Message>>(null);
    const [replyText, setReplyText] = useState("");
    const [expandedThinking, setExpandedThinking] = useState<
        Record<string, boolean>
    >({});
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

    const handleAttachmentsSelected = (newAttachments: Attachment[]) => {
        setAttachments((prev) => [...prev, ...newAttachments]);
    };

    const handleRemoveAttachment = (attachmentId: string) => {
        setAttachments((prev) => prev.filter((a) => a.id !== attachmentId));
    };

    const handleSend = async () => {
        if (
            (!inputText.trim() && attachments.length === 0) ||
            isLoading ||
            !currentChat
        )
            return;

        const userMessageText = inputText.trim();
        const messageCount = messages[chatId]?.length ?? 0;
        setInputText("");
        setAttachments([]);

        const effectiveThinking = reasoningSupported
            ? currentChat.thinking
            : "none";
        const effectiveSearchLevel = searchSupported
            ? currentChat.searchLevel
            : "none";

        const skillForMessage = selectedSkill;
        const contextContent = skillForMessage
            ? `${skillForMessage.prompt}\n\nUser: ${userMessageText}`
            : userMessageText;

        const attachmentIds: string[] = [];

        if (attachments.length > 0) {
            const savedAttachments = await Promise.all(
                attachments.map(async (attachment) => {
                    const savedAttachment = {
                        ...attachment,
                        messageId: "", // Will be updated after message is created
                    };
                    const id = saveAttachment(savedAttachment);
                    attachmentIds.push(id);
                    return savedAttachment;
                }),
            );
        }

        const userMessage = await addMessage({
            sessionId: chatId,
            role: "user",
            content: userMessageText,
            contextContent: contextContent,
            skill: skillForMessage,
            modelId: currentChat.modelId,
            thinkingLevel: effectiveThinking,
            searchLevel: effectiveSearchLevel,
            attachmentIds: attachmentIds.length > 0 ? attachmentIds : undefined,
        });

        if (attachmentIds.length > 0) {
            await Promise.all(
                attachmentIds.map((id) => {
                    const attachment = getAttachment(id);
                    if (attachment) {
                        saveAttachment({
                            ...attachment,
                            messageId: userMessage.id,
                        });
                    }
                }),
            );
        }

        if (skillForMessage) {
            setSelectedSkill(null);
        }

        const updatedChat = getChatTitleUpdate(
            currentChat,
            userMessageText,
            messageCount,
        );
        if (updatedChat) {
            await updateChat(updatedChat);
        }

        setIsLoading(true);

        try {
            if (!apiKey) {
                await addMessage({
                    sessionId: chatId,
                    role: "assistant",
                    content:
                        "Please set your OpenRouter API key in Settings to send messages.",
                    contextContent:
                        "Please set your OpenRouter API key in Settings to send messages.",
                    thinkingLevel: effectiveThinking,
                    searchLevel: effectiveSearchLevel,
                });
                setIsLoading(false);
                return;
            }

            if (reasoningSupported) {
                await setDefaultThinking(effectiveThinking);
            }
            if (searchSupported) {
                await setDefaultSearchLevel(effectiveSearchLevel);
            }

            const chatMessages = messages[chatId] || [];
            const openRouterMessages = chatMessages.map((msg: Message) => ({
                role: msg.role as "user" | "assistant" | "system",
                content: msg.contextContent,
            }));

            let assistantContent = "";
            let assistantThinking = "";

            const response = await sendMessage(
                apiKey,
                [
                    ...openRouterMessages,
                    { role: "user", content: contextContent },
                ],
                {
                    id: currentChat.id,
                    modelId: currentChat.modelId,
                    thinking: effectiveThinking,
                    searchLevel: effectiveSearchLevel,
                },
                currentModel,
                (chunk: string, thinking?: string) => {
                    if (thinking) {
                        assistantThinking += thinking;
                    } else {
                        assistantContent += chunk;
                    }
                    setReplyText(assistantContent);
                },
            );

            const clonedSkill = skillForMessage
                ? {
                      ...skillForMessage,
                      createdAt: Date.now(),
                  }
                : null;

            await addMessage({
                sessionId: chatId,
                role: "assistant",
                content:
                    assistantContent ||
                    response.choices[0]?.message?.content ||
                    "",
                contextContent:
                    assistantContent ||
                    response.choices[0]?.message?.content ||
                    "",
                thinking: assistantThinking || undefined,
                modelId: response.model,
                skill: clonedSkill,
                thinkingLevel: effectiveThinking,
                searchLevel: effectiveSearchLevel,
            });
        } catch (error) {
            const errorMessage =
                error instanceof Error ? error.message : "Unknown error";
            await addMessage({
                sessionId: chatId,
                role: "assistant",
                content: `Error: ${errorMessage}`,
                contextContent: `Error: ${errorMessage}`,
                thinkingLevel: effectiveThinking,
                searchLevel: effectiveSearchLevel,
            });
        } finally {
            setIsLoading(false);
            setReplyText("");
        }
    };

    const handleDeleteChat = async () => {
        await deleteChat(chatId);
        router.replace("/");
    };

    const toggleThinking = (messageId: string) => {
        setExpandedThinking((prev) => ({
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

    const chatMessages = messages[chatId] || [];
    const streamingThinkingLevel =
        currentChat && reasoningSupported ? currentChat.thinking : "none";
    const streamingSearchLevel =
        currentChat && searchSupported ? currentChat.searchLevel : "none";

    const getMarkdownStyle = (role: string) => {
        const isUser = role === "user";
        return {
            body: {
                fontSize: 16,
                lineHeight: 22,
                color: isUser ? colors.textOnAccent : colors.text,
            },
            code: {
                backgroundColor: isUser
                    ? colors.codeBackgroundOnAccent
                    : colors.codeBackground,
                color: isUser ? colors.textOnAccent : colors.text,
                paddingHorizontal: 4,
                paddingVertical: 2,
                borderRadius: 4,
                fontFamily: isUser ? undefined : "monospace",
            },
            codeblock: {
                backgroundColor: isUser
                    ? colors.codeBackgroundOnAccent
                    : colors.codeBackground,
                color: isUser ? colors.textOnAccent : colors.text,
                padding: 12,
                borderRadius: 8,
                fontFamily: isUser ? undefined : "monospace",
            },
            link: {
                color: isUser ? colors.linkOnAccent : colors.link,
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

    const renderAttachments = (attachmentIds: string[]) => {
        if (!attachmentIds || attachmentIds.length === 0) return null;

        const attachments = attachmentIds
            .map((id) => getAttachment(id))
            .filter((a): a is Attachment => a !== undefined);

        if (attachments.length === 0) return null;

        return (
            <View style={styles.attachmentsContainer}>
                {attachments.map(renderAttachmentThumbnail)}
            </View>
        );
    };

    const renderSkillInfo = (skill: Skill) => (
        <View style={styles.skillPanel}>
            <View style={styles.skillHeader}>
                <Text style={styles.skillIcon}>✨</Text>
                <Text style={styles.skillName}>{skill.name}</Text>
            </View>
            {skill.description && (
                <Text style={styles.skillDescription}>{skill.description}</Text>
            )}
        </View>
    );

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

    const renderMessage = ({ item }: { item: Message }) => {
        const isUser = item.role === "user";
        const hasSearchBadge =
            item.searchLevel !== undefined && item.searchLevel !== "none";
        const hasThinkingBadge =
            item.thinkingLevel !== undefined && item.thinkingLevel !== "none";
        const showDivider = hasSearchBadge || hasThinkingBadge;

        return (
            <View
                style={[
                    styles.messageGroup,
                    isUser
                        ? styles.messageGroupUser
                        : styles.messageGroupAssistant,
                ]}
            >
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
                <View
                    style={[
                        styles.messageContainer,
                        isUser ? styles.userMessage : styles.assistantMessage,
                    ]}
                >
                    {item.skill &&
                        item.role === "user" &&
                        renderSkillInfo(item.skill)}
                    <Markdown style={getMarkdownStyle(item.role)}>
                        {item.content}
                    </Markdown>
                    {item.attachmentIds &&
                        item.attachmentIds.length > 0 &&
                        renderAttachments(item.attachmentIds)}
                    <View
                        style={[
                            styles.messageMetaRow,
                            isUser
                                ? styles.messageMetaRowUser
                                : styles.messageMetaRowAssistant,
                        ]}
                    >
                        <Text style={styles.messageMetaText}>
                            {formatMessageTime(item.createdAt)}
                        </Text>
                        {showDivider && (
                            <View style={styles.messageMetaDivider} />
                        )}
                        {hasSearchBadge && (
                            <View
                                style={[
                                    styles.messageBadge,
                                    styles.searchBadge,
                                ]}
                            >
                                <Text
                                    style={[
                                        styles.messageBadgeText,
                                        styles.searchBadgeText,
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
                                style={[
                                    styles.messageBadge,
                                    styles.thinkingBadge,
                                ]}
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
                    </View>
                </View>
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

            <KeyboardAvoidingView
                behavior={Platform.OS === "ios" ? "padding" : "height"}
                style={styles.content}
            >
                <FlatList
                    ref={flatListRef}
                    data={[
                        ...chatMessages,
                        ...(replyText
                            ? [
                                  {
                                      id: "streaming",
                                      sessionId: chatId,
                                      role: "assistant" as const,
                                      content: replyText,
                                      contextContent: replyText,
                                      modelId: currentChat.modelId,
                                      thinkingLevel: streamingThinkingLevel,
                                      searchLevel: streamingSearchLevel,
                                      createdAt: Date.now(),
                                  },
                              ]
                            : []),
                    ]}
                    keyExtractor={(item) => item.id}
                    renderItem={renderMessage}
                    contentContainerStyle={styles.listContent}
                    style={styles.list}
                    keyboardShouldPersistTaps="handled"
                    onContentSizeChange={() =>
                        flatListRef.current?.scrollToEnd?.({ animated: true })
                    }
                />

                <MessageInput
                    inputText={inputText}
                    onInputChange={setInputText}
                    onSend={handleSend}
                    isLoading={isLoading}
                    disabled={!apiKey}
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
                    onSkillSelect={setSelectedSkill}
                    attachments={attachments}
                    onAttachmentsChange={handleAttachmentsSelected}
                    onRemoveAttachment={handleRemoveAttachment}
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
            marginBottom: 8,
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
            backgroundColor: colors.accent,
        },
        assistantMessage: {
            alignSelf: "flex-start",
            backgroundColor: colors.surfaceMuted,
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
        thinkingBadge: {
            backgroundColor: colors.warningSoft,
            borderColor: colors.warningBorder,
        },
        thinkingBadgeText: {
            color: colors.warning,
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
            marginBottom: 8,
            padding: 8,
            backgroundColor: colors.accentSoft,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: colors.accentBorder,
        },
        skillHeader: {
            flexDirection: "row",
            alignItems: "center",
            marginBottom: 4,
        },
        skillIcon: {
            fontSize: 12,
            marginRight: 4,
        },
        skillName: {
            fontSize: 12,
            fontWeight: "600",
            color: colors.accent,
        },
        skillDescription: {
            fontSize: 11,
            color: colors.textMuted,
        },
        attachmentsContainer: {
            marginTop: 8,
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 8,
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
