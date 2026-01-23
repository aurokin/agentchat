import React, { useEffect, useState, useRef, type ReactElement } from "react";
import {
    View,
    Text,
    TextInput,
    FlatList,
    TouchableOpacity,
    StyleSheet,
    KeyboardAvoidingView,
    Platform,
    ActivityIndicator,
    Image,
    Dimensions,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useChatContext } from "../../../src/contexts/ChatContext";
import { getApiKey } from "../../../src/lib/storage";
import { getAttachment } from "../../../src/lib/db";
import { sendMessage } from "@shared/core/openrouter";
import type { Message } from "@shared/core/types";
import { SafeAreaView } from "react-native-safe-area-context";
import Markdown from "react-native-markdown-display";

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
    } = useChatContext();

    const [inputText, setInputText] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [apiKey, setApiKey] = useState<string | null>(null);

    const flatListRef = useRef<FlatList<Message>>(null);
    const [replyText, setReplyText] = useState("");

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

    const handleSend = async () => {
        if (!inputText.trim() || isLoading || !currentChat) return;

        const userMessageText = inputText.trim();
        setInputText("");

        const userMessage = await addMessage({
            sessionId: chatId,
            role: "user",
            content: userMessageText,
            contextContent: userMessageText,
        });

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
                content: msg.content,
            }));

            let assistantContent = "";
            let assistantThinking = "";

            const response = await sendMessage(
                apiKey,
                [
                    ...openRouterMessages,
                    { role: "user", content: userMessageText },
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

    const screenWidth = Dimensions.get("window").width;

    const renderAttachments = (attachmentIds: string[]) => {
        if (!attachmentIds || attachmentIds.length === 0) return null;

        return (
            <View style={styles.attachmentsContainer}>
                {attachmentIds.map((attachmentId) => {
                    const attachment = getAttachment(attachmentId);
                    if (!attachment) return null;

                    const aspectRatio =
                        attachment.width && attachment.height
                            ? attachment.width / attachment.height
                            : 1;
                    const maxWidth = screenWidth - 80;
                    const maxHeight = 300;
                    let imageWidth = maxWidth;
                    let imageHeight = maxWidth / aspectRatio;

                    if (imageHeight > maxHeight) {
                        imageHeight = maxHeight;
                        imageWidth = maxHeight * aspectRatio;
                    }

                    return (
                        <Image
                            key={attachment.id}
                            source={{ uri: attachment.data }}
                            style={[
                                styles.attachmentImage,
                                { width: imageWidth, height: imageHeight },
                            ]}
                            resizeMode="contain"
                        />
                    );
                })}
            </View>
        );
    };

    const renderMessage = ({ item }: { item: Message }) => (
        <View
            style={[
                styles.messageContainer,
                item.role === "user"
                    ? styles.userMessage
                    : styles.assistantMessage,
            ]}
        >
            <Markdown style={getMarkdownStyle(item.role)}>
                {item.content}
            </Markdown>
            {item.attachmentIds &&
                item.attachmentIds.length > 0 &&
                renderAttachments(item.attachmentIds)}
            {item.thinking && (
                <View style={styles.thinkingContainer}>
                    <Text style={styles.thinkingLabel}>Thinking:</Text>
                    <Text style={styles.thinkingText}>{item.thinking}</Text>
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

            <KeyboardAvoidingView
                behavior={Platform.OS === "ios" ? "padding" : "height"}
                keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
                style={styles.inputContainer}
            >
                <View style={styles.inputWrapper}>
                    <TextInput
                        style={styles.textInput}
                        value={inputText}
                        onChangeText={setInputText}
                        placeholder="Type a message..."
                        multiline
                        maxLength={10000}
                    />
                    <TouchableOpacity
                        style={[
                            styles.sendButton,
                            isLoading || !inputText.trim()
                                ? styles.sendButtonDisabled
                                : {},
                        ]}
                        onPress={handleSend}
                        disabled={isLoading || !inputText.trim()}
                    >
                        {isLoading ? (
                            <ActivityIndicator color="#fff" size="small" />
                        ) : (
                            <Text style={styles.sendButtonText}>Send</Text>
                        )}
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>
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
    thinkingContainer: {
        marginTop: 8,
        paddingTop: 8,
        borderTopWidth: 1,
        borderTopColor: "rgba(0,0,0,0.1)",
    },
    thinkingLabel: {
        fontSize: 12,
        fontWeight: "600",
        color: "#666",
        marginBottom: 4,
    },
    thinkingText: {
        fontSize: 12,
        color: "#888",
        fontStyle: "italic",
    },
    inputContainer: {
        borderTopWidth: 1,
        borderTopColor: "#eee",
        backgroundColor: "#fff",
    },
    inputWrapper: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 12,
        paddingVertical: 8,
    },
    textInput: {
        flex: 1,
        maxHeight: 120,
        minHeight: 44,
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 22,
        backgroundColor: "#f0f0f0",
        fontSize: 16,
        marginRight: 8,
    },
    sendButton: {
        backgroundColor: "#007AFF",
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 22,
        justifyContent: "center",
    },
    sendButtonDisabled: {
        backgroundColor: "#ccc",
    },
    sendButtonText: {
        color: "#fff",
        fontSize: 16,
        fontWeight: "600",
    },
    attachmentsContainer: {
        marginTop: 8,
        gap: 8,
    },
    attachmentImage: {
        borderRadius: 8,
        backgroundColor: "rgba(0,0,0,0.05)",
    },
});
