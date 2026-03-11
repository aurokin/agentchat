"use client";

import {
    useState,
    useRef,
    useEffect,
    useCallback,
    useMemo,
    startTransition,
} from "react";
import { useRouter } from "next/navigation";
import { api } from "@convex/_generated/api";
import { useChat } from "@/contexts/ChatContext";
import { useSettings } from "@/contexts/SettingsContext";
import { useStorageAdapter } from "@/contexts/SyncContext";
import {
    OpenRouterApiError,
    buildMessageContent,
    type MessageContent,
} from "@/lib/openrouter";
import { useActionSafe } from "@/hooks/useConvexSafe";
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
    type Message,
} from "@/lib/types";
import { APP_DEFAULT_MODEL } from "@shared/core/models";
import {
    applyModelCapabilities,
    getLastUserSettings,
    resolveInitialChatSettings,
} from "@shared/core/defaults";
import { trimTrailingEmptyLines } from "@shared/core/text";
import { generateUUID } from "@/lib/utils";
import { Hexagon, Sparkles, AlertCircle, RefreshCw } from "lucide-react";
import { ConvexStorageAdapter } from "@/lib/sync/convex-adapter";

interface ErrorState {
    message: string;
    isRetryable: boolean;
}

interface StreamingMessageState {
    id: string;
    content: string;
    thinking?: string;
}

export function applyStreamingMessageOverlay(
    messages: Message[],
    streamingMessage: StreamingMessageState | null,
): Message[] {
    if (!streamingMessage) {
        return messages;
    }

    return messages.map((message) =>
        message.id === streamingMessage.id
            ? {
                  ...message,
                  content: streamingMessage.content,
                  contextContent: streamingMessage.content,
                  thinking: streamingMessage.thinking,
              }
            : message,
    );
}

const isKeybindingBlocked = () => {
    if (typeof document === "undefined") return false;
    return Boolean(
        document.querySelector(
            "[data-keybinding-scope='modal'][data-keybinding-open='true'], [data-keybinding-scope='dropdown'][data-keybinding-open='true']",
        ),
    );
};

const isTypingTarget = (target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return false;
    if (target.isContentEditable) return true;
    const tag = target.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
};

const getDigitFromEvent = (event: KeyboardEvent): number | null => {
    const code = event.code.toLowerCase();
    if (code.startsWith("digit")) {
        return Number.parseInt(code.replace("digit", ""), 10);
    }
    if (code.startsWith("numpad")) {
        return Number.parseInt(code.replace("numpad", ""), 10);
    }

    const parsed = Number.parseInt(event.key, 10);
    if (!Number.isNaN(parsed)) {
        return parsed;
    }

    const hasAlt =
        event.altKey ||
        event.getModifierState("Alt") ||
        event.getModifierState("AltGraph");
    if (!hasAlt) {
        return null;
    }

    const optionDigitMap: Record<string, number> = {
        "¡": 1,
        "™": 2,
        "£": 3,
        "¢": 4,
        "∞": 5,
        "§": 6,
        "¶": 7,
        "•": 8,
        ª: 9,
        º: 0,
    };

    return optionDigitMap[event.key] ?? null;
};

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
    const router = useRouter();
    const {
        currentChat,
        messages,
        isMessagesLoading,
        addMessage,
        updateMessage,
        updateChat,
        createChat,
    } = useChat();
    const {
        defaultModel,
        defaultThinking,
        defaultSearchLevel,
        setDefaultModel,
        setDefaultThinking,
        setDefaultSearchLevel,
        models,
        favoriteModels,
    } = useSettings();
    const storageAdapter = useStorageAdapter();
    const sendOpenRouterMessage = useActionSafe(api.openrouter.sendMessage);

    const [sending, setSending] = useState(false);
    const [error, setError] = useState<ErrorState | null>(null);
    const [retryChat, setRetryChat] = useState<{
        content: string;
        contextContent: string;
    } | null>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const [streamingMessage, setStreamingMessage] =
        useState<StreamingMessageState | null>(null);
    const pendingStreamingUpdateRef = useRef<StreamingMessageState | null>(
        null,
    );
    const streamingFrameRef = useRef<number | null>(null);
    const lastInitializedChatIdRef = useRef<string | null>(null);

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
        if (!currentChat) {
            lastInitializedChatIdRef.current = null;
        }
    }, [currentChat]);

    const displayedMessages = useMemo(() => {
        return applyStreamingMessageOverlay(messages, streamingMessage);
    }, [messages, streamingMessage]);

    useEffect(() => {
        if (!currentChat || isMessagesLoading) return;
        if (lastInitializedChatIdRef.current === currentChat.id) return;
        const messagesMatchChat =
            messages.length === 0 ||
            messages.every((message) => message.sessionId === currentChat.id);
        if (!messagesMatchChat) return;

        const fallbackModelId =
            defaultModel || currentChat.modelId || APP_DEFAULT_MODEL;
        const defaults = {
            modelId: fallbackModelId,
            thinking: defaultThinking,
            searchLevel: defaultSearchLevel,
        };
        const lastUserSettings = getLastUserSettings(messages);
        const resolvedSettings = resolveInitialChatSettings({
            messageCount: messages.length,
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
        currentChat,
        defaultModel,
        defaultThinking,
        defaultSearchLevel,
        isMessagesLoading,
        messages,
        models,
        updateChat,
    ]);

    useEffect(() => {
        if (currentChat && inputRef.current) {
            inputRef.current.focus();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentChat?.id]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (isKeybindingBlocked()) return;

            const key = event.key.toLowerCase();
            const code = event.code.toLowerCase();
            const hasModifier =
                event.ctrlKey ||
                event.metaKey ||
                event.getModifierState("Control") ||
                event.getModifierState("Meta");
            const hasAlt =
                event.altKey ||
                event.getModifierState("Alt") ||
                event.getModifierState("AltGraph");

            if (!hasModifier && !event.shiftKey && !hasAlt && key === "/") {
                if (isTypingTarget(event.target)) return;
                event.preventDefault();
                inputRef.current?.focus();
                return;
            }

            if (hasModifier && !event.shiftKey && !hasAlt && key === ",") {
                event.preventDefault();
                startTransition(() => {
                    router.push("/settings");
                });
                return;
            }

            if (!currentChat) return;

            if (hasModifier && hasAlt && !event.shiftKey && code === "keym") {
                const availableFavorites = favoriteModels.filter((modelId) =>
                    models.some((model) => model.id === modelId),
                );
                if (availableFavorites.length === 0) return;
                const currentIndex = availableFavorites.indexOf(
                    currentChat.modelId,
                );
                const nextIndex =
                    currentIndex === -1
                        ? 0
                        : (currentIndex + 1) % availableFavorites.length;
                const nextModelId = availableFavorites[nextIndex];
                if (nextModelId && nextModelId !== currentChat.modelId) {
                    event.preventDefault();
                    const nextModel = models.find(
                        (model) => model.id === nextModelId,
                    );
                    const supportsReasoning = nextModel
                        ? modelSupportsReasoning(nextModel)
                        : true;
                    const supportsSearch = nextModel
                        ? modelSupportsSearch(nextModel)
                        : true;
                    const nextThinking = supportsReasoning
                        ? currentChat.thinking
                        : "none";
                    const nextSearchLevel = supportsSearch
                        ? currentChat.searchLevel
                        : "none";
                    void updateChat({
                        ...currentChat,
                        modelId: nextModelId,
                        thinking: nextThinking,
                        searchLevel: nextSearchLevel,
                    });
                    setDefaultModel(nextModelId);
                }
                return;
            }

            if (
                hasModifier &&
                hasAlt &&
                !event.shiftKey &&
                event.key === "Backspace"
            ) {
                const currentModel = models.find(
                    (model) => model.id === currentChat.modelId,
                );
                if (!modelSupportsReasoning(currentModel)) return;
                event.preventDefault();
                void updateChat({ ...currentChat, thinking: "none" });
                setDefaultThinking("none");
                return;
            }

            if (hasModifier && hasAlt && !event.shiftKey) {
                const level = getDigitFromEvent(event);
                if (level !== null && level >= 1 && level <= 5) {
                    const currentModel = models.find(
                        (model) => model.id === currentChat.modelId,
                    );
                    if (!modelSupportsReasoning(currentModel)) return;
                    const levels: ThinkingLevel[] = [
                        "minimal",
                        "low",
                        "medium",
                        "high",
                        "xhigh",
                    ];
                    const nextLevel = levels[level - 1];
                    if (nextLevel) {
                        event.preventDefault();
                        void updateChat({
                            ...currentChat,
                            thinking: nextLevel,
                        });
                        setDefaultThinking(nextLevel);
                    }
                    return;
                }
            }

            if (
                hasModifier &&
                event.shiftKey &&
                !hasAlt &&
                event.key === "Backspace"
            ) {
                const currentModel = models.find(
                    (model) => model.id === currentChat.modelId,
                );
                if (!modelSupportsSearch(currentModel)) return;
                event.preventDefault();
                void updateChat({ ...currentChat, searchLevel: "none" });
                setDefaultSearchLevel("none");
                return;
            }

            if (hasModifier && event.shiftKey && !hasAlt) {
                const level = getDigitFromEvent(event);
                if (level !== null && level >= 1 && level <= 3) {
                    const currentModel = models.find(
                        (model) => model.id === currentChat.modelId,
                    );
                    if (!modelSupportsSearch(currentModel)) return;
                    const levels: SearchLevel[] = ["low", "medium", "high"];
                    const nextLevel = levels[level - 1];
                    if (nextLevel) {
                        event.preventDefault();
                        void updateChat({
                            ...currentChat,
                            searchLevel: nextLevel,
                        });
                        setDefaultSearchLevel(nextLevel);
                    }
                }
            }
        };

        window.addEventListener("keydown", handleKeyDown, true);
        return () => window.removeEventListener("keydown", handleKeyDown, true);
    }, [
        currentChat,
        favoriteModels,
        models,
        router,
        setDefaultModel,
        setDefaultThinking,
        setDefaultSearchLevel,
        updateChat,
    ]);

    const handleSendMessage = async (
        content: string,
        pendingAttachments?: PendingAttachment[],
    ) => {
        const chatSnapshot = currentChat;
        const messagesSnapshot = messages;

        if (!chatSnapshot) {
            setError({ message: "No chat selected", isRetryable: false });
            return;
        }

        setSending(true);
        setError(null);
        setRetryChat(null);
        clearStreamingMessage();

        let assistantMessageId: string | null = null;
        let fullResponse = "";
        let fullThinking = "";

        try {
            const currentModel = models.find(
                (m) => m.id === chatSnapshot.modelId,
            );
            const supportsReasoning = modelSupportsReasoning(currentModel);
            const supportsSearch = modelSupportsSearch(currentModel);

            const effectiveThinking = supportsReasoning
                ? chatSnapshot.thinking
                : "none";
            const effectiveSearchLevel: SearchLevel =
                supportsSearch && chatSnapshot.searchLevel !== "none"
                    ? chatSnapshot.searchLevel
                    : "none";

            const contextContent = content;

            // Generate a stable message ID for attachments
            const messageId = generateUUID();
            const isCloudStorage =
                storageAdapter instanceof ConvexStorageAdapter;

            // Convert pending attachments to stored attachments
            let attachmentIds: string[] | undefined;
            const attachments: Attachment[] = pendingAttachments?.length
                ? pendingAttachments.map((pa) => ({
                      id: generateUUID(),
                      messageId,
                      type: "image" as const,
                      mimeType: pa.mimeType as ImageMimeType,
                      data: pa.data,
                      width: pa.width,
                      height: pa.height,
                      size: pa.size,
                      createdAt: Date.now(),
                  }))
                : [];

            if (attachments.length > 0) {
                attachmentIds = attachments.map((a) => a.id);

                if (isCloudStorage) {
                    // Cloud attachments must reference an existing message, so create the
                    // message first, then upload attachments, then patch attachmentIds.
                    await addMessage({
                        id: messageId,
                        role: "user",
                        content: content,
                        contextContent: contextContent,
                        modelId: chatSnapshot.modelId,
                        thinkingLevel: effectiveThinking,
                        searchLevel: effectiveSearchLevel,
                        chatId: chatSnapshot.id,
                    });

                    await storageAdapter.saveAttachments(attachments);

                    // Update message so UI fetches attachments and cloud message record
                    // references them for future reloads.
                    await updateMessage(messageId, { attachmentIds });
                } else {
                    // Local storage can save attachments first so they render immediately.
                    await storageAdapter.saveAttachments(attachments);

                    await addMessage({
                        id: messageId,
                        role: "user",
                        content: content,
                        contextContent: contextContent,
                        modelId: chatSnapshot.modelId,
                        thinkingLevel: effectiveThinking,
                        searchLevel: effectiveSearchLevel,
                        attachmentIds,
                        chatId: chatSnapshot.id,
                    });
                }
            } else {
                await addMessage({
                    id: messageId,
                    role: "user",
                    content: content,
                    contextContent: contextContent,
                    modelId: chatSnapshot.modelId,
                    thinkingLevel: effectiveThinking,
                    searchLevel: effectiveSearchLevel,
                    chatId: chatSnapshot.id,
                });
            }

            setDefaultModel(chatSnapshot.modelId);
            if (supportsReasoning) {
                setDefaultThinking(effectiveThinking);
            }
            if (supportsSearch) {
                setDefaultSearchLevel(effectiveSearchLevel);
            }

            const updatedChat = getChatTitleUpdate(
                chatSnapshot,
                content,
                messagesSnapshot.length,
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
            for (const m of messagesSnapshot) {
                let messageContent: MessageContent = m.contextContent;

                // Load attachments if present
                if (m.attachmentIds && m.attachmentIds.length > 0) {
                    const msgAttachments =
                        await storageAdapter.getAttachmentsByMessage(m.id);
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
                modelId: chatSnapshot.modelId,
                thinkingLevel: effectiveThinking,
                searchLevel: effectiveSearchLevel,
                chatId: chatSnapshot.id,
            });
            assistantMessageId = assistantMessage.id;
            queueStreamingMessageUpdate({
                id: assistantMessage.id,
                content: "",
                thinking: undefined,
            });

            const response = await sendOpenRouterMessage({
                messages: currentMessages,
                session: {
                    id: chatSnapshot.id,
                    modelId: chatSnapshot.modelId,
                    thinking: effectiveThinking,
                    searchLevel: effectiveSearchLevel,
                },
                model: currentModel ?? undefined,
            });
            if (!response) {
                throw new Error(
                    "Convex is not configured for this deployment.",
                );
            }

            fullResponse = response.choices[0]?.message?.content ?? "";
            fullThinking = response.choices[0]?.message?.thinking ?? "";

            const trimmedResponse = trimTrailingEmptyLines(fullResponse) ?? "";
            const trimmedThinking = trimTrailingEmptyLines(fullThinking);
            await updateMessage(assistantMessage.id, {
                content: trimmedResponse,
                contextContent: trimmedResponse,
                thinking: trimmedThinking || undefined,
            });
        } catch (err) {
            if (assistantMessageId && (fullResponse || fullThinking)) {
                const partialResponse =
                    trimTrailingEmptyLines(fullResponse) ?? "";
                const partialThinking = trimTrailingEmptyLines(fullThinking);
                try {
                    await updateMessage(assistantMessageId, {
                        content: partialResponse,
                        contextContent: partialResponse,
                        thinking: partialThinking || undefined,
                    });
                } catch {
                    // Preserve the original streaming error as the surfaced failure.
                }
            }

            if (err instanceof OpenRouterApiError) {
                setError({
                    message: err.message,
                    isRetryable: err.isRetryable,
                });
                if (err.isRetryable) {
                    setRetryChat({
                        content: content,
                        contextContent: content,
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
            clearStreamingMessage();
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
        const nextModel = models.find((model) => model.id === modelId);
        const supportsReasoning = nextModel
            ? modelSupportsReasoning(nextModel)
            : true;
        const supportsSearch = nextModel
            ? modelSupportsSearch(nextModel)
            : true;
        const nextThinking = supportsReasoning ? currentChat.thinking : "none";
        const nextSearchLevel = supportsSearch
            ? currentChat.searchLevel
            : "none";
        await updateChat({
            ...currentChat,
            modelId,
            thinking: nextThinking,
            searchLevel: nextSearchLevel,
        });
        setDefaultModel(modelId);
    };

    const handleThinkingChange = async (value: ThinkingLevel) => {
        if (!currentChat) return;
        await updateChat({ ...currentChat, thinking: value });
        setDefaultThinking(value);
    };

    const handleSearchChange = async (level: SearchLevel) => {
        if (!currentChat) return;
        await updateChat({ ...currentChat, searchLevel: level });
        setDefaultSearchLevel(level);
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
                                Agentchat
                            </span>
                        </h2>
                        <p className="text-foreground-muted text-lg mb-8">
                            Your gateway to AI-powered conversations
                        </p>

                        <button
                            onClick={() => createChat()}
                            className="btn-deco btn-deco-primary text-base px-8 py-3 cursor-pointer"
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
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-error/10 hover:bg-error/20 text-error rounded-md transition-colors cursor-pointer"
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
                <MessageList messages={displayedMessages} sending={sending} />
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
