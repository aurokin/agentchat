"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
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
    type Skill,
} from "@/lib/types";
import { saveAttachments, getAttachmentsByMessage } from "@/lib/db";
import * as storage from "@/lib/storage";
import { generateUUID } from "@/lib/utils";
import { Hexagon, Sparkles, AlertCircle, RefreshCw } from "lucide-react";

interface ErrorState {
    message: string;
    isRetryable: boolean;
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
    if (event.code.startsWith("Digit")) {
        return Number.parseInt(event.code.replace("Digit", ""), 10);
    }
    if (event.code.startsWith("Numpad")) {
        return Number.parseInt(event.code.replace("Numpad", ""), 10);
    }
    const parsed = Number.parseInt(event.key, 10);
    return Number.isNaN(parsed) ? null : parsed;
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

export function getSkillSelectionUpdate({
    messageCount,
    defaultSkill,
    selectedSkill,
    selectedSkillMode,
}: {
    messageCount: number;
    defaultSkill: Skill | null;
    selectedSkill: Skill | null;
    selectedSkillMode: "auto" | "manual";
}): Skill | null | undefined {
    if (messageCount > 0) {
        if (selectedSkillMode === "auto" && selectedSkill) {
            return null;
        }
        return undefined;
    }

    if (selectedSkillMode === "manual") {
        return undefined;
    }

    if (defaultSkill && selectedSkill?.id !== defaultSkill.id) {
        return defaultSkill;
    }

    if (!defaultSkill && selectedSkill) {
        return null;
    }

    return undefined;
}

export function ChatWindow() {
    const router = useRouter();
    const {
        currentChat,
        messages,
        addMessage,
        updateMessage,
        updateChat,
        createChat,
    } = useChat();
    const {
        apiKey,
        selectedSkill,
        defaultSkill,
        selectedSkillMode,
        setSelectedSkill,
        setDefaultSkill,
        models,
        favoriteModels,
        skills,
    } = useSettings();
    const [sending, setSending] = useState(false);
    const [error, setError] = useState<ErrorState | null>(null);
    const [retryChat, setRetryChat] = useState<{
        content: string;
        contextContent: string;
    } | null>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        if (!currentChat) return;
        const nextSkill = getSkillSelectionUpdate({
            messageCount: messages.length,
            defaultSkill,
            selectedSkill,
            selectedSkillMode,
        });
        if (nextSkill !== undefined) {
            setSelectedSkill(nextSkill, { mode: "auto" });
        }
    }, [
        currentChat,
        defaultSkill,
        messages.length,
        selectedSkill,
        selectedSkillMode,
        setSelectedSkill,
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
                router.push("/settings");
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
                    void updateChat({ ...currentChat, modelId: nextModelId });
                }
                return;
            }

            if (hasModifier && hasAlt && !event.shiftKey && code === "keys") {
                event.preventDefault();
                const skillSequence = [null, ...skills];
                const currentIndex = selectedSkill
                    ? skillSequence.findIndex(
                          (skill) => skill?.id === selectedSkill.id,
                      )
                    : 0;
                const nextIndex =
                    (currentIndex + 1) % Math.max(skillSequence.length, 1);
                const nextSkill = skillSequence[nextIndex] ?? null;
                setSelectedSkill(nextSkill, { mode: "manual" });
                return;
            }

            if (hasModifier && hasAlt && !event.shiftKey && code === "keyn") {
                event.preventDefault();
                setSelectedSkill(null, { mode: "manual" });
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
        selectedSkill,
        setSelectedSkill,
        skills,
        updateChat,
    ]);

    const handleSendMessage = async (
        content: string,
        pendingAttachments?: PendingAttachment[],
    ) => {
        const chatSnapshot = currentChat;
        const messagesSnapshot = messages;

        if (!apiKey) {
            setError({
                message: "Please add your OpenRouter API key in Settings",
                isRetryable: false,
            });
            return;
        }

        if (!chatSnapshot) {
            setError({ message: "No chat selected", isRetryable: false });
            return;
        }

        setSending(true);
        setError(null);
        setRetryChat(null);

        const skillForMessage = selectedSkill;
        if (skillForMessage) {
            setDefaultSkill(skillForMessage);
        }

        try {
            const currentModel = models.find(
                (m) => m.id === chatSnapshot.modelId,
            );
            const supportsReasoning = modelSupportsReasoning(currentModel);
            const supportsSearch = modelSupportsSearch(currentModel);

            storage.setDefaultModel(chatSnapshot.modelId);
            if (supportsReasoning) {
                storage.setDefaultThinking(chatSnapshot.thinking);
            }
            if (supportsSearch) {
                storage.setDefaultSearchLevel(chatSnapshot.searchLevel);
            }

            const effectiveThinking = supportsReasoning
                ? chatSnapshot.thinking
                : "none";
            const effectiveSearchLevel: SearchLevel =
                supportsSearch && chatSnapshot.searchLevel !== "none"
                    ? chatSnapshot.searchLevel
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
                modelId: chatSnapshot.modelId,
                thinkingLevel: effectiveThinking,
                searchLevel: effectiveSearchLevel,
                attachmentIds,
                chatId: chatSnapshot.id,
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
                modelId: chatSnapshot.modelId,
                thinkingLevel: effectiveThinking,
                searchLevel: effectiveSearchLevel,
                chatId: chatSnapshot.id,
            });

            let fullResponse = "";
            let fullThinking = "";

            await sendMessage(
                apiKey,
                currentMessages,
                chatSnapshot,
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
