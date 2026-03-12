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
import type { FunctionReference } from "convex/server";
import { useChat } from "@/contexts/ChatContext";
import { useAgent } from "@/contexts/AgentContext";
import { useSettings } from "@/contexts/SettingsContext";
import {
    getSharedAgentchatSocketClient,
    type AgentchatSocketEvent,
} from "@/lib/agentchat-socket";
import { useActionSafe } from "@/hooks/useConvexSafe";
import { MessageList } from "./MessageList";
import { MessageInput } from "./MessageInput";
import {
    modelSupportsReasoning,
    type ThinkingLevel,
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

const convexApi = api as typeof api & {
    backendTokens: {
        issue: FunctionReference<"action">;
    };
};

interface ErrorState {
    message: string;
    isRetryable: boolean;
}

interface StreamingMessageState {
    id: string;
    content: string;
    thinking?: string;
}

interface ActiveRunState {
    conversationId: string;
    assistantMessageId: string;
    userContent: string;
    content: string;
    runId: string | null;
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
    const { agents, selectedAgent } = useAgent();
    const {
        defaultModel,
        defaultThinking,
        setDefaultModel,
        setDefaultThinking,
        models,
        favoriteModels,
    } = useSettings();
    const issueBackendSessionToken = useActionSafe(
        convexApi.backendTokens.issue,
    );
    const socketClient = useMemo(() => getSharedAgentchatSocketClient(), []);

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
    const activeRunRef = useRef<ActiveRunState | null>(null);
    const currentChatRef = useRef<ChatSession | null>(null);
    const messagesRef = useRef<Message[]>([]);

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
        currentChatRef.current = currentChat;
    }, [currentChat]);

    useEffect(() => {
        messagesRef.current = messages;
    }, [messages]);

    const persistActiveAssistantMessage = useCallback(
        async (contentOverride?: string) => {
            const activeRun = activeRunRef.current;
            if (!activeRun) {
                return;
            }

            const finalContent =
                trimTrailingEmptyLines(contentOverride ?? activeRun.content) ??
                "";
            await updateMessage(activeRun.assistantMessageId, {
                content: finalContent,
                contextContent: finalContent,
            });
        },
        [updateMessage],
    );

    const clearActiveRun = useCallback(() => {
        activeRunRef.current = null;
        clearStreamingMessage();
        setSending(false);
    }, [clearStreamingMessage]);

    const getBackendSessionToken = useCallback(async () => {
        const result = await issueBackendSessionToken({});
        if (!result || typeof result.token !== "string") {
            throw new Error(
                "Unable to create an authenticated Agentchat server session.",
            );
        }

        return result.token;
    }, [issueBackendSessionToken]);

    const handleSocketEvent = useCallback(
        (event: AgentchatSocketEvent) => {
            const currentChatSnapshot = currentChatRef.current;
            if (
                !currentChatSnapshot ||
                !("conversationId" in event.payload) ||
                event.payload.conversationId !== currentChatSnapshot.id
            ) {
                return;
            }

            let activeRun = activeRunRef.current;

            if (event.type === "run.started") {
                if (!activeRun) {
                    const assistantMessage = messagesRef.current.find(
                        (message) => message.id === event.payload.messageId,
                    );
                    const assistantMessageIndex = messagesRef.current.findIndex(
                        (message) => message.id === event.payload.messageId,
                    );
                    const userContent =
                        (
                            messagesRef.current
                                .slice(
                                    0,
                                    assistantMessageIndex >= 0
                                        ? assistantMessageIndex
                                        : undefined,
                                )
                                .filter((message) => message.role === "user")
                                .at(-1) ?? messagesRef.current.at(-1)
                        )?.content ?? "";

                    activeRun = {
                        conversationId: event.payload.conversationId,
                        assistantMessageId: event.payload.messageId,
                        userContent,
                        content: assistantMessage?.content ?? "",
                        runId: event.payload.runId,
                    };
                    activeRunRef.current = activeRun;
                    setSending(true);

                    if (assistantMessage?.content) {
                        queueStreamingMessageUpdate({
                            id: activeRun.assistantMessageId,
                            content: assistantMessage.content,
                        });
                    }
                    return;
                }

                activeRun.runId = event.payload.runId;
                return;
            }

            if (!activeRun) {
                return;
            }

            if (
                ("runId" in event.payload || event.type === "run.completed") &&
                activeRun.runId &&
                "runId" in event.payload &&
                event.payload.runId !== activeRun.runId
            ) {
                return;
            }

            if (event.type === "message.delta") {
                activeRun.content = event.payload.content;
                queueStreamingMessageUpdate({
                    id: activeRun.assistantMessageId,
                    content: event.payload.content,
                });
                return;
            }

            if (event.type === "message.completed") {
                activeRun.content = event.payload.content;
                queueStreamingMessageUpdate({
                    id: activeRun.assistantMessageId,
                    content: event.payload.content,
                });
                return;
            }

            if (event.type === "run.completed") {
                void persistActiveAssistantMessage().finally(() => {
                    clearActiveRun();
                });
                return;
            }

            if (event.type === "run.interrupted") {
                void persistActiveAssistantMessage().finally(() => {
                    clearActiveRun();
                });
                return;
            }

            if (event.type === "run.failed") {
                const message = event.payload.error.message;
                void persistActiveAssistantMessage().finally(() => {
                    setError({
                        message,
                        isRetryable: true,
                    });
                    setRetryChat({
                        content: activeRun.userContent,
                        contextContent: activeRun.userContent,
                    });
                    clearActiveRun();
                });
                return;
            }

            if (event.type === "connection.error") {
                const message = event.payload.message;
                void persistActiveAssistantMessage().finally(() => {
                    setError({
                        message,
                        isRetryable: true,
                    });
                    setRetryChat({
                        content: activeRun.userContent,
                        contextContent: activeRun.userContent,
                    });
                    clearActiveRun();
                });
            }
        },
        [
            clearActiveRun,
            persistActiveAssistantMessage,
            queueStreamingMessageUpdate,
        ],
    );

    useEffect(() => {
        const unsubscribe = socketClient.subscribe(handleSocketEvent);
        return unsubscribe;
    }, [handleSocketEvent, socketClient]);

    useEffect(() => {
        if (!currentChat) {
            return;
        }

        const unsubscribeConversation = socketClient.subscribeToConversation(
            currentChat.id,
        );

        void socketClient
            .ensureConnected(getBackendSessionToken)
            .catch((error) => {
                console.error("Failed to connect Agentchat socket:", error);
            });

        return unsubscribeConversation;
    }, [currentChat, getBackendSessionToken, socketClient]);

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
        });

        if (
            constrainedSettings.modelId !== currentChat.modelId ||
            constrainedSettings.thinking !== currentChat.thinking
        ) {
            void updateChat({
                ...currentChat,
                modelId: constrainedSettings.modelId,
                thinking: constrainedSettings.thinking,
            });
        }
        lastInitializedChatIdRef.current = currentChat.id;
    }, [
        currentChat,
        defaultModel,
        defaultThinking,
        isMessagesLoading,
        messages,
        models,
        updateChat,
    ]);

    useEffect(() => {
        if (!currentChat || isMessagesLoading) {
            return;
        }

        const existing = activeRunRef.current;
        if (existing && existing.conversationId !== currentChat.id) {
            clearActiveRun();
        }

        if (activeRunRef.current) {
            return;
        }

        const activeAssistantMessage =
            [...messages]
                .reverse()
                .find(
                    (message) =>
                        message.role === "assistant" &&
                        message.status === "streaming",
                ) ?? null;
        if (!activeAssistantMessage) {
            return;
        }

        const assistantIndex = messages.findIndex(
            (message) => message.id === activeAssistantMessage.id,
        );
        const userContent =
            messages
                .slice(0, assistantIndex >= 0 ? assistantIndex : undefined)
                .filter((message) => message.role === "user")
                .at(-1)?.content ?? "";

        activeRunRef.current = {
            conversationId: currentChat.id,
            assistantMessageId: activeAssistantMessage.id,
            userContent,
            content: activeAssistantMessage.content,
            runId: activeAssistantMessage.runId ?? null,
        };
        setSending(true);
        queueStreamingMessageUpdate({
            id: activeAssistantMessage.id,
            content: activeAssistantMessage.content,
        });
    }, [
        clearActiveRun,
        currentChat,
        isMessagesLoading,
        messages,
        queueStreamingMessageUpdate,
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
            const settingsLocked = currentChat.settingsLockedAt != null;

            if (
                !settingsLocked &&
                hasModifier &&
                hasAlt &&
                !event.shiftKey &&
                code === "keym"
            ) {
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
                    const nextThinking = supportsReasoning
                        ? currentChat.thinking
                        : "none";
                    void updateChat({
                        ...currentChat,
                        modelId: nextModelId,
                        thinking: nextThinking,
                    });
                    setDefaultModel(nextModelId);
                }
                return;
            }

            if (
                !settingsLocked &&
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

            if (!settingsLocked && hasModifier && hasAlt && !event.shiftKey) {
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
        updateChat,
    ]);

    const handleSendMessage = async (content: string) => {
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

        try {
            const currentModel = models.find(
                (m) => m.id === chatSnapshot.modelId,
            );
            const supportsReasoning = modelSupportsReasoning(currentModel);

            const effectiveThinking = supportsReasoning
                ? chatSnapshot.thinking
                : "none";

            const contextContent = content;
            const messageId = generateUUID();

            await addMessage({
                id: messageId,
                role: "user",
                content: content,
                contextContent: contextContent,
                modelId: chatSnapshot.modelId,
                thinkingLevel: effectiveThinking,
                chatId: chatSnapshot.id,
            });

            setDefaultModel(chatSnapshot.modelId);
            if (supportsReasoning) {
                setDefaultThinking(effectiveThinking);
            }

            const updatedChat = getChatTitleUpdate(
                chatSnapshot,
                content,
                messagesSnapshot.length,
            );
            if (updatedChat) {
                await updateChat(updatedChat);
            }

            const assistantMessage = await addMessage({
                role: "assistant",
                content: "",
                contextContent: "",
                modelId: chatSnapshot.modelId,
                thinkingLevel: effectiveThinking,
                chatId: chatSnapshot.id,
            });
            assistantMessageId = assistantMessage.id;
            queueStreamingMessageUpdate({
                id: assistantMessage.id,
                content: "",
                thinking: undefined,
            });
            activeRunRef.current = {
                conversationId: chatSnapshot.id,
                assistantMessageId: assistantMessage.id,
                userContent: content,
                content: "",
                runId: null,
            };

            await socketClient.ensureConnected(getBackendSessionToken);
            socketClient.send({
                id: generateUUID(),
                type: "conversation.send",
                payload: {
                    conversationId: chatSnapshot.id,
                    agentId: chatSnapshot.agentId,
                    modelId: chatSnapshot.modelId,
                    thinking: effectiveThinking,
                    content: contextContent,
                    userMessageId: messageId,
                    assistantMessageId: assistantMessage.id,
                    history: messagesSnapshot.map((message) => ({
                        role: message.role,
                        content: message.contextContent,
                    })),
                },
            });
        } catch (err) {
            activeRunRef.current = null;
            setSending(false);
            clearStreamingMessage();
            if (assistantMessageId) {
                try {
                    await updateMessage(assistantMessageId, {
                        content: "",
                        contextContent: "",
                    });
                } catch {
                    // Preserve the original error surfaced below.
                }
            }

            setError({
                message:
                    err instanceof Error
                        ? err.message
                        : "Failed to send message",
                isRetryable: true,
            });
            setRetryChat({
                content,
                contextContent: content,
            });
        }
    };

    const handleCancel = useCallback(() => {
        const activeRun = activeRunRef.current;
        if (!activeRun) {
            return;
        }

        try {
            socketClient.send({
                id: generateUUID(),
                type: "conversation.interrupt",
                payload: {
                    conversationId: activeRun.conversationId,
                },
            });
        } catch (error) {
            setError({
                message:
                    error instanceof Error
                        ? error.message
                        : "Failed to interrupt the active run",
                isRetryable: true,
            });
        }
    }, [socketClient]);

    const handleRetry = async () => {
        if (!retryChat || !currentChat) return;
        const { content } = retryChat;
        setRetryChat(null);
        setError(null);
        await handleSendMessage(content);
    };

    const handleModelChange = async (modelId: string) => {
        if (!currentChat) return;
        if (currentChat.settingsLockedAt != null) return;
        const nextModel = models.find((model) => model.id === modelId);
        const supportsReasoning = nextModel
            ? modelSupportsReasoning(nextModel)
            : true;
        const nextThinking = supportsReasoning ? currentChat.thinking : "none";
        await updateChat({
            ...currentChat,
            modelId,
            thinking: nextThinking,
        });
        setDefaultModel(modelId);
    };

    const handleThinkingChange = async (value: ThinkingLevel) => {
        if (!currentChat) return;
        if (currentChat.settingsLockedAt != null) return;
        await updateChat({ ...currentChat, thinking: value });
        setDefaultThinking(value);
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
                                A
                            </span>
                        </div>

                        <h2 className="text-4xl font-light mb-3 tracking-tight">
                            Welcome to{" "}
                            <span className="font-semibold text-gradient-primary">
                                Agentchat
                            </span>
                        </h2>
                        <p className="text-foreground-muted text-lg mb-8">
                            {agents.length === 0
                                ? "Configure an agent on the server to begin."
                                : selectedAgent
                                  ? `Conversations for ${selectedAgent.name} stay isolated from your other agents.`
                                  : "Choose an agent in the sidebar to load its conversations."}
                        </p>

                        <button
                            onClick={() => createChat()}
                            disabled={!selectedAgent}
                            className="btn-deco btn-deco-primary text-base px-8 py-3 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            <Sparkles size={18} />
                            <span>
                                {selectedAgent
                                    ? `Start ${selectedAgent.name} Conversation`
                                    : "Select an Agent First"}
                            </span>
                        </button>

                        <p className="mt-6 text-sm text-muted-foreground">
                            {selectedAgent
                                ? "Or select an existing conversation from the sidebar"
                                : "Existing conversations appear after you choose an agent"}
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
                    onCancel={handleCancel}
                    disabled={false}
                    canSend={!sending}
                    isSending={sending}
                    settingsLocked={currentChat.settingsLockedAt != null}
                    selectedModel={currentChat.modelId}
                    onModelChange={handleModelChange}
                    thinkingLevel={currentChat.thinking}
                    onThinkingChange={handleThinkingChange}
                    reasoningSupported={modelSupportsReasoning(
                        models.find((m) => m.id === currentChat.modelId),
                    )}
                />
            </div>
        </div>
    );
}
