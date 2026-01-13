"use client";

import { useState, useRef, useEffect } from "react";
import { useChat } from "@/contexts/ChatContext";
import { useSettings } from "@/contexts/SettingsContext";
import {
    sendMessage,
    OpenRouterApiError,
    buildMessageContent,
    type MessageContent,
} from "@/lib/openrouter";
import { MessageList } from "./MessageList";
import { MessageInput } from "./MessageInput";
import {
    modelSupportsSearch,
    modelSupportsReasoning,
    modelSupportsVision,
    type ThinkingLevel,
    type SearchLevel,
    type PendingAttachment,
    type Attachment,
    type ImageMimeType,
    type ChatSession,
} from "@/lib/types";
import { saveAttachments, getAttachmentsByMessage } from "@/lib/db";
import * as storage from "@/lib/storage";
import { generateUUID } from "@/lib/utils";
import { Hexagon, Sparkles, AlertCircle, RefreshCw } from "lucide-react";

interface ErrorState {
    message: string;
    isRetryable: boolean;
}

export function getChatTitleUpdate(
    chat: ChatSession | null,
    content: string,
    messageCount: number,
): ChatSession | null {
    if (!chat || chat.title !== "New Chat" || messageCount !== 0) {
        return null;
    }

    const title = content.slice(0, 50) + (content.length > 50 ? "..." : "");
    return { ...chat, title };
}

export function ChatWindow() {
    const {
        currentChat,
        messages,
        addMessage,
        updateMessage,
        updateChat,
        createChat,
    } = useChat();
    const { apiKey, selectedSkill, defaultSkill, setSelectedSkill, models } =
        useSettings();
    const [sending, setSending] = useState(false);
    const [error, setError] = useState<ErrorState | null>(null);
    const [retryChat, setRetryChat] = useState<{
        content: string;
        contextContent: string;
    } | null>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const currentChatRef = useRef(currentChat);

    useEffect(() => {
        currentChatRef.current = currentChat;
    }, [currentChat]);

    useEffect(() => {
        if (!currentChat) return;
        if (messages.length === 0) {
            if (defaultSkill && selectedSkill?.id !== defaultSkill.id) {
                setSelectedSkill(defaultSkill, { updateDefault: false });
            }
            if (!defaultSkill && selectedSkill) {
                setSelectedSkill(null, { updateDefault: false });
            }
        } else if (selectedSkill) {
            setSelectedSkill(null, { updateDefault: false });
        }
    }, [
        currentChat,
        defaultSkill,
        messages.length,
        selectedSkill,
        setSelectedSkill,
    ]);

    useEffect(() => {
        if (currentChat && inputRef.current) {
            inputRef.current.focus();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentChat?.id]);

    const handleSendMessage = async (
        content: string,
        pendingAttachments?: PendingAttachment[],
    ) => {
        if (!apiKey) {
            setError({
                message: "Please add your OpenRouter API key in Settings",
                isRetryable: false,
            });
            return;
        }

        if (!currentChat) {
            setError({ message: "No chat selected", isRetryable: false });
            return;
        }

        setSending(true);
        setError(null);
        setRetryChat(null);

        const skillForMessage = selectedSkill;
        if (skillForMessage) {
            setSelectedSkill(null, { updateDefault: false });
        }

        try {
            const currentModel = models.find(
                (m) => m.id === currentChat.modelId,
            );
            const supportsReasoning = modelSupportsReasoning(currentModel);
            const supportsSearch = modelSupportsSearch(currentModel);

            storage.setDefaultModel(currentChat.modelId);
            if (supportsReasoning) {
                storage.setDefaultThinking(currentChat.thinking);
            }
            if (supportsSearch) {
                storage.setDefaultSearchLevel(currentChat.searchLevel);
            }

            const effectiveThinking = supportsReasoning
                ? currentChat.thinking
                : "none";
            const effectiveSearchLevel: SearchLevel =
                supportsSearch && currentChat.searchLevel !== "none"
                    ? currentChat.searchLevel
                    : "none";

            const contextContent = skillForMessage
                ? `${skillForMessage.prompt}\n\nUser: ${content}`
                : content;

            const clonedSkill = skillForMessage
                ? JSON.parse(JSON.stringify(skillForMessage))
                : null;

            // Generate a temporary message ID for attachments
            const messageId = generateUUID();

            // Convert pending attachments to stored attachments
            let attachmentIds: string[] | undefined;
            if (pendingAttachments && pendingAttachments.length > 0) {
                const attachments: Attachment[] = pendingAttachments.map(
                    (pa) => ({
                        id: generateUUID(),
                        messageId,
                        type: "image" as const,
                        mimeType: pa.mimeType as ImageMimeType,
                        data: pa.data,
                        width: pa.width,
                        height: pa.height,
                        size: pa.size,
                        createdAt: Date.now(),
                    }),
                );

                await saveAttachments(attachments);
                attachmentIds = attachments.map((a) => a.id);
            }

            await addMessage({
                role: "user",
                content: content,
                contextContent: contextContent,
                skill: clonedSkill,
                modelId: currentChat.modelId,
                thinkingLevel: effectiveThinking,
                searchLevel: effectiveSearchLevel,
                attachmentIds,
            });

            const updatedChat = getChatTitleUpdate(
                currentChatRef.current,
                content,
                messages.length,
            );
            if (updatedChat) {
                await updateChat(updatedChat);
            }

            // Build messages array with attachments for API
            const currentMessages: Array<{
                role: string;
                content: MessageContent;
            }> = [];

            // Add past messages with their attachments
            for (const m of messages) {
                let messageContent: MessageContent = m.contextContent;

                // Load attachments if present
                if (m.attachmentIds && m.attachmentIds.length > 0) {
                    const msgAttachments = await getAttachmentsByMessage(m.id);
                    if (msgAttachments.length > 0) {
                        messageContent = buildMessageContent(
                            m.contextContent,
                            msgAttachments,
                        );
                    }
                }

                currentMessages.push({
                    role: m.role,
                    content: messageContent,
                });
            }

            // Add the new user message with its attachments
            const newUserAttachments: Attachment[] | undefined =
                pendingAttachments?.map((pa) => ({
                    id: generateUUID(),
                    messageId: "",
                    type: "image" as const,
                    mimeType: pa.mimeType as ImageMimeType,
                    data: pa.data,
                    width: pa.width,
                    height: pa.height,
                    size: pa.size,
                    createdAt: Date.now(),
                }));

            currentMessages.push({
                role: "user",
                content: buildMessageContent(
                    contextContent,
                    newUserAttachments,
                ),
            });

            const assistantMessage = await addMessage({
                role: "assistant",
                content: "",
                contextContent: "",
                skill: null,
                modelId: currentChat.modelId,
                thinkingLevel: effectiveThinking,
                searchLevel: effectiveSearchLevel,
            });

            let fullResponse = "";
            let fullThinking = "";

            await sendMessage(
                apiKey,
                currentMessages,
                currentChat,
                currentModel,
                (chunk, thinking) => {
                    if (thinking !== undefined) {
                        fullThinking += thinking;
                    } else {
                        fullResponse += chunk;
                    }

                    updateMessage(assistantMessage.id, {
                        content: fullResponse,
                        contextContent: fullResponse,
                        thinking: fullThinking || undefined,
                    });
                },
            );
        } catch (err) {
            if (err instanceof OpenRouterApiError) {
                setError({
                    message: err.message,
                    isRetryable: err.isRetryable,
                });
                if (err.isRetryable) {
                    setRetryChat({
                        content: content,
                        contextContent: skillForMessage
                            ? `${skillForMessage.prompt}\n\nUser: ${content}`
                            : content,
                    });
                }
            } else {
                setError({
                    message:
                        err instanceof Error
                            ? err.message
                            : "Failed to send message",
                    isRetryable: true,
                });
            }
        } finally {
            setSending(false);
        }
    };

    const handleRetry = async () => {
        if (!retryChat || !currentChat) return;
        const { content } = retryChat;
        setRetryChat(null);
        setError(null);
        await handleSendMessage(content);
    };

    const handleModelChange = async (modelId: string) => {
        if (!currentChat) return;
        await updateChat({ ...currentChat, modelId });
    };

    const handleThinkingChange = async (value: ThinkingLevel) => {
        if (!currentChat) return;
        await updateChat({ ...currentChat, thinking: value });
    };

    const handleSearchChange = async (level: SearchLevel) => {
        if (!currentChat) return;
        await updateChat({ ...currentChat, searchLevel: level });
    };

    if (!currentChat) {
        return (
            <div className="flex-1 flex flex-col h-full bg-background relative overflow-hidden">
                {/* Decorative elements */}
                <div className="absolute inset-0 pointer-events-none">
                    {/* Subtle radial gradient */}
                    <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-radial from-primary/5 via-transparent to-transparent" />
                    {/* Corner decorations */}
                    <div className="absolute top-8 left-8 w-24 h-24 border-l border-t border-primary/20" />
                    <div className="absolute bottom-8 right-8 w-24 h-24 border-r border-b border-primary/20" />
                    {/* Grid pattern */}
                    <div
                        className="absolute inset-0 opacity-[0.02]"
                        style={{
                            backgroundImage:
                                "linear-gradient(var(--primary) 1px, transparent 1px), linear-gradient(90deg, var(--primary) 1px, transparent 1px)",
                            backgroundSize: "60px 60px",
                        }}
                    />
                </div>

                <div className="flex-1 flex items-center justify-center relative z-10">
                    <div className="text-center max-w-lg px-6">
                        {/* Logo */}
                        <div className="relative inline-block mb-8">
                            <Hexagon
                                size={80}
                                className="text-primary"
                                strokeWidth={1}
                            />
                            <span className="absolute inset-0 flex items-center justify-center text-2xl font-semibold text-primary">
                                R
                            </span>
                        </div>

                        <h2 className="text-4xl font-light mb-3 tracking-tight">
                            Welcome to{" "}
                            <span className="font-semibold text-gradient-primary">
                                RouterChat
                            </span>
                        </h2>
                        <p className="text-foreground-muted text-lg mb-8">
                            Your gateway to AI-powered conversations
                        </p>

                        <button
                            onClick={() => createChat()}
                            className="btn-deco btn-deco-primary text-base px-8 py-3"
                        >
                            <Sparkles size={18} />
                            <span>Start New Conversation</span>
                        </button>

                        <p className="mt-6 text-sm text-muted-foreground">
                            Or select an existing conversation from the sidebar
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col h-full bg-background relative overflow-hidden">
            {/* Decorative top line */}
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />

            {/* Error message - floats at top if present */}
            {error && (
                <div className="px-6 py-3 bg-error/5 border-b border-error/20 flex items-center gap-3 relative z-20">
                    <AlertCircle
                        size={16}
                        className="text-error flex-shrink-0"
                    />
                    <p className="text-error text-sm flex-1">{error.message}</p>
                    {error.isRetryable && (
                        <button
                            onClick={handleRetry}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-error/10 hover:bg-error/20 text-error rounded-md transition-colors"
                            disabled={sending}
                        >
                            <RefreshCw
                                size={12}
                                className={sending ? "animate-spin" : ""}
                            />
                            Retry
                        </button>
                    )}
                </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto relative z-10">
                <MessageList messages={messages} sending={sending} />
            </div>

            {/* Unified input bar with all controls */}
            <div className="border-t border-border p-4 bg-background-elevated/30 relative z-10">
                <MessageInput
                    ref={inputRef}
                    onSend={handleSendMessage}
                    disabled={false}
                    canSend={!sending}
                    selectedModel={currentChat.modelId}
                    onModelChange={handleModelChange}
                    thinkingLevel={currentChat.thinking}
                    onThinkingChange={handleThinkingChange}
                    reasoningSupported={modelSupportsReasoning(
                        models.find((m) => m.id === currentChat.modelId),
                    )}
                    searchLevel={currentChat.searchLevel}
                    onSearchChange={handleSearchChange}
                    searchSupported={modelSupportsSearch(
                        models.find((m) => m.id === currentChat.modelId),
                    )}
                    visionSupported={modelSupportsVision(
                        models.find((m) => m.id === currentChat.modelId),
                    )}
                    sessionId={currentChat.id}
                />
            </div>
        </div>
    );
}
