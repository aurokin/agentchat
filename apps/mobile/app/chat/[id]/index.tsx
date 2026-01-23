import React, { useEffect, useState, useRef, type ReactElement } from "react";
import {
    View,
    Text,
    FlatList,
    TouchableOpacity,
    StyleSheet,
    ActivityIndicator,
    Image,
    Alert,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useChatContext } from "../../../src/contexts/ChatContext";
import { useModelContext } from "../../../src/contexts/ModelContext";
import { useSkillsContext } from "../../../src/contexts/SkillsContext";
import { getApiKey } from "../../../src/lib/storage";
import { getAttachment, saveAttachment } from "../../../src/lib/db";
import { sendMessage } from "@shared/core/openrouter";
import {
    modelSupportsReasoning,
    modelSupportsSearch,
} from "@shared/core/models";
import type {
    Message,
    ThinkingLevel,
    SearchLevel,
    Attachment,
} from "@shared/core/types";
import type { Skill } from "@shared/core/skills";
import { SafeAreaView } from "react-native-safe-area-context";
import Markdown from "react-native-markdown-display";
import { MessageInput } from "../../../src/components/chat/MessageInput";
import { AttachmentGallery } from "../../../src/components/chat/AttachmentGallery";

const BrainIcon = ({ size }: { size: number }) => (
    <Text style={{ fontSize: size, lineHeight: size }}>🧠</Text>
);

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
        selectedModel,
        selectModel: setSelectedModel,
    } = useModelContext();
    const { skills, selectedSkill, setSelectedSkill } = useSkillsContext();

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

    const handleModelChange = async (modelId: string) => {
        if (!currentChat) return;
        await setSelectedModel(modelId);
        const updatedChat = { ...currentChat, modelId };
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
        setInputText("");
        setAttachments([]);

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
                });
                setIsLoading(false);
                return;
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
                    thinking: currentChat.thinking,
                    searchLevel: currentChat.searchLevel,
                },
                undefined,
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
            });
        } catch (error) {
            const errorMessage =
                error instanceof Error ? error.message : "Unknown error";
            await addMessage({
                sessionId: chatId,
                role: "assistant",
                content: `Error: ${errorMessage}`,
                contextContent: `Error: ${errorMessage}`,
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

    const getMarkdownStyle = (role: string) => {
        const baseStyle = {
            body: {
                fontSize: 16,
                lineHeight: 22,
                color: role === "user" ? "#fff" : "#000",
            },
            code: {
                backgroundColor: "rgba(0,0,0,0.1)",
                paddingHorizontal: 4,
                paddingVertical: 2,
                borderRadius: 4,
                fontFamily: role === "user" ? undefined : "monospace",
            },
            codeblock: {
                backgroundColor: "rgba(0,0,0,0.1)",
                padding: 12,
                borderRadius: 8,
                fontFamily: role === "user" ? undefined : "monospace",
            },
            link: {
                color: role === "user" ? "#8ecfff" : "#007AFF",
                textDecorationLine: "underline" as const,
            },
        };
        return baseStyle;
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

    const renderMessage = ({ item }: { item: Message }) => (
        <View
            style={[
                styles.messageContainer,
                item.role === "user"
                    ? styles.userMessage
                    : styles.assistantMessage,
            ]}
        >
            {item.skill && item.role === "user" && renderSkillInfo(item.skill)}
            <Markdown style={getMarkdownStyle(item.role)}>
                {item.content}
            </Markdown>
            {item.attachmentIds &&
                item.attachmentIds.length > 0 &&
                renderAttachments(item.attachmentIds)}
            {item.thinking && (
                <View style={styles.thinkingPanel}>
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
        </View>
    );

    if (!currentChat) {
        return (
            <SafeAreaView style={styles.container}>
                <ActivityIndicator size="large" />
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.replace("/")}>
                    <Text style={styles.backButton}>← Chats</Text>
                </TouchableOpacity>
                <Text style={styles.headerTitle} numberOfLines={1}>
                    {currentChat.title}
                </Text>
                <TouchableOpacity onPress={handleDeleteChat}>
                    <Text style={styles.deleteButton}>Delete</Text>
                </TouchableOpacity>
            </View>

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
                                  createdAt: Date.now(),
                              },
                          ]
                        : []),
                ]}
                keyExtractor={(item) => item.id}
                renderItem={renderMessage}
                contentContainerStyle={styles.listContent}
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

            <AttachmentGallery
                visible={galleryVisible}
                attachments={galleryAttachments}
                initialIndex={galleryInitialIndex}
                onClose={() => setGalleryVisible(false)}
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#fff",
    },
    header: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: "#eee",
    },
    backButton: {
        fontSize: 16,
        color: "#007AFF",
        marginRight: 12,
    },
    headerTitle: {
        flex: 1,
        fontSize: 17,
        fontWeight: "600",
    },
    deleteButton: {
        fontSize: 16,
        color: "#FF3B30",
    },
    listContent: {
        padding: 16,
    },
    messageContainer: {
        maxWidth: "85%",
        padding: 12,
        borderRadius: 16,
        marginBottom: 8,
    },
    userMessage: {
        alignSelf: "flex-end",
        backgroundColor: "#007AFF",
    },
    assistantMessage: {
        alignSelf: "flex-start",
        backgroundColor: "#f0f0f0",
    },
    messageText: {
        fontSize: 16,
        lineHeight: 22,
    },
    userMessageText: {
        color: "#fff",
    },
    assistantMessageText: {
        color: "#000",
    },
    thinkingPanel: {
        marginTop: 8,
        borderWidth: 1,
        borderColor: "rgba(255, 149, 0, 0.3)",
        backgroundColor: "rgba(255, 149, 0, 0.1)",
        borderRadius: 8,
        overflow: "hidden",
    },
    thinkingHeader: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 12,
        paddingVertical: 8,
        backgroundColor: "rgba(255, 149, 0, 0.05)",
    },
    thinkingIcon: {
        fontSize: 10,
        color: "#FF9500",
        marginRight: 6,
        width: 12,
    },
    thinkingLabel: {
        fontSize: 12,
        fontWeight: "600",
        color: "#FF9500",
        textTransform: "uppercase" as const,
        letterSpacing: 0.5,
    },
    thinkingContent: {
        paddingHorizontal: 12,
        paddingBottom: 12,
        borderTopWidth: 1,
        borderTopColor: "rgba(255, 149, 0, 0.2)",
    },
    thinkingText: {
        fontSize: 12,
        color: "#666",
        lineHeight: 18,
    },
    skillPanel: {
        marginBottom: 8,
        padding: 8,
        backgroundColor: "rgba(0, 122, 255, 0.1)",
        borderRadius: 8,
        borderWidth: 1,
        borderColor: "rgba(0, 122, 255, 0.2)",
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
        color: "#007AFF",
    },
    skillDescription: {
        fontSize: 11,
        color: "#666",
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
        backgroundColor: "rgba(0,0,0,0.05)",
    },
    attachmentMetadata: {
        paddingHorizontal: 4,
        paddingVertical: 2,
    },
    attachmentDimension: {
        fontSize: 10,
        color: "#666",
    },
    attachmentSize: {
        fontSize: 10,
        color: "#999",
    },
    attachmentImage: {
        borderRadius: 8,
        backgroundColor: "rgba(0,0,0,0.05)",
    },
});
