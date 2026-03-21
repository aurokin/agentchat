import React, {
    createContext,
    useContext,
    useState,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    type ReactNode,
} from "react";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { FunctionReference } from "convex/server";
import {
    usePersistenceAdapter,
    useWorkspace,
} from "@/contexts/WorkspaceContext";
import type { ChatSession, Message } from "@shared/core/types";
import type {
    AgentRuntimeActivitySummary,
    ChatRunSummary,
    ConversationRuntimeBindingSummary,
    ConversationRuntimeState,
    RuntimeBindingSummary,
} from "@/lib/types";
import { APP_DEFAULT_MODEL } from "@shared/core/models";
import {
    mapConvexChatToSession,
    mapConvexMessageToMessage,
    mergeByIdWithPending,
} from "@shared/core/persistence";
import { v4 as uuidv4 } from "uuid";
import {
    getSelectedChatId,
    setSelectedChatId,
    clearSelectedChatId,
} from "@/lib/storage";
import { useModelContext } from "@/contexts/ModelContext";
import { deriveConversationRuntimeState } from "@/contexts/runtime-helpers";
import { useAgent } from "@/contexts/AgentContext";
import { getSharedAgentchatSocketClient } from "@/lib/agentchat-socket";
import { useAuthContext } from "@/lib/convex/AuthContext";
import {
    buildConversationRuntimeBindingMap,
    getScopedChatStateKey,
} from "@/contexts/chat-state";

interface ChatContextValue {
    chats: ChatSession[];
    currentChat: ChatSession | null;
    messages: Record<string, Message[]>;
    runSummaries: ChatRunSummary[];
    runtimeState: ConversationRuntimeState;
    conversationRuntimeBindings: Record<
        string,
        ConversationRuntimeBindingSummary
    >;
    agentRuntimeActivitySummaries: AgentRuntimeActivitySummary[];
    isLoading: boolean;
    isMessagesLoading: boolean;
    error: string | null;
    defaultModel: string;
    loadChats: () => Promise<void>;
    createChat: (title?: string, modelId?: string) => Promise<ChatSession>;
    selectChat: (chatId: string) => Promise<void>;
    deleteChat: (chatId: string) => Promise<void>;
    deleteChats: (chatIds: string[]) => Promise<void>;
    updateChat: (chat: ChatSession) => Promise<void>;
    loadMessages: (chatId: string, agentId?: string) => Promise<void>;
    hasMessagesInChats: (chatIds: string[]) => Promise<boolean>;
    addMessage: (
        message: Omit<Message, "createdAt" | "id"> & { id?: string },
    ) => Promise<Message>;
    insertMessage: (message: Message) => void;
    updateMessage: (message: Message) => Promise<void>;
    patchMessage: (
        id: string,
        chatId: string,
        updates: Partial<
            Pick<
                Message,
                "content" | "contextContent" | "reasoning" | "status" | "kind"
            >
        >,
    ) => void;
}

const ChatContext = createContext<ChatContextValue | null>(null);

const convexApi = api as typeof api & {
    runs: {
        listByChat: FunctionReference<"query">;
    };
    runtimeBindings: {
        getByChat: FunctionReference<"query">;
        listByUser: FunctionReference<"query">;
        listAgentActivityCounts: FunctionReference<"query">;
    };
};

export function useChatContext(): ChatContextValue {
    const context = useContext(ChatContext);
    if (!context) {
        throw new Error("useChatContext must be used within ChatProvider");
    }
    return context;
}

interface ChatProviderProps {
    children: ReactNode;
}

export function ChatProvider({
    children,
}: ChatProviderProps): React.ReactElement {
    const [chats, setChats] = useState<ChatSession[]>([]);
    const [currentChat, setCurrentChat] = useState<ChatSession | null>(null);
    const [messages, setMessages] = useState<Record<string, Message[]>>({});
    const [isLoading, setIsLoading] = useState(false);
    const [isMessagesLoading, setIsMessagesLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { getBackendSessionToken } = useAuthContext();
    const { defaultAgentId, selectedModel, selectedVariantId, models } =
        useModelContext();
    const { selectedAgentId } = useAgent();
    const validatedSelectedModel =
        selectedModel && models.some((model) => model.id === selectedModel)
            ? selectedModel
            : null;
    const appDefaultAvailable = models.some(
        (model) => model.id === APP_DEFAULT_MODEL,
    );
    const defaultModelId =
        validatedSelectedModel ??
        (appDefaultAvailable ? APP_DEFAULT_MODEL : models[0]?.id) ??
        APP_DEFAULT_MODEL;

    const adapter = usePersistenceAdapter();
    const { isWorkspaceReady, isConvexAvailable, workspaceUserId } =
        useWorkspace();
    const pendingChatIdsRef = React.useRef<Set<string>>(new Set());
    const pendingMessageIdsRef = React.useRef<Set<string>>(new Set());
    const currentChatRef = useRef<ChatSession | null>(null);
    const currentChatScopeRef = useRef<string | null>(null);
    const latestViewedAtRef = useRef<Record<string, number>>({});
    const markViewedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
        null,
    );
    const pendingViewedChatRef = useRef<{
        agentId: string;
        chatId: string;
        timestamp: number;
    } | null>(null);

    const isWorkspaceActive = isConvexAvailable && isWorkspaceReady;
    const currentChatId = currentChat?.id ?? null;
    const workspaceChats = useQuery(
        api.chats.listByUser,
        isWorkspaceActive && workspaceUserId
            ? { userId: workspaceUserId }
            : "skip",
    );
    const workspaceCurrentChat = useQuery(
        api.chats.getByLocalId,
        isWorkspaceActive &&
            workspaceUserId &&
            currentChatId &&
            currentChat?.agentId
            ? {
                  userId: workspaceUserId,
                  agentId: currentChat.agentId,
                  localId: currentChatId,
              }
            : "skip",
    );
    const workspaceMessages = useQuery(
        api.messages.listByChat,
        isWorkspaceActive && workspaceCurrentChat?._id
            ? { chatId: workspaceCurrentChat._id }
            : "skip",
    );
    const workspaceRunSummaries = useQuery(
        convexApi.runs.listByChat,
        isWorkspaceActive && workspaceCurrentChat?._id
            ? { chatId: workspaceCurrentChat._id }
            : "skip",
    );
    const workspaceRuntimeBinding = useQuery(
        convexApi.runtimeBindings.getByChat,
        isWorkspaceActive && workspaceCurrentChat?._id
            ? { chatId: workspaceCurrentChat._id }
            : "skip",
    );
    const workspaceConversationRuntimeBindings = useQuery(
        convexApi.runtimeBindings.listByUser,
        isWorkspaceActive && workspaceUserId ? {} : "skip",
    ) as ConversationRuntimeBindingSummary[] | undefined;
    const workspaceAgentRuntimeActivitySummaries = useQuery(
        convexApi.runtimeBindings.listAgentActivityCounts,
        isWorkspaceActive && workspaceUserId ? {} : "skip",
    ) as AgentRuntimeActivitySummary[] | undefined;
    const runSummaries = useMemo(
        () => workspaceRunSummaries ?? [],
        [workspaceRunSummaries],
    );
    const runtimeBinding = useMemo<RuntimeBindingSummary | null | undefined>(
        () => workspaceRuntimeBinding,
        [workspaceRuntimeBinding],
    );
    const currentMessages = useMemo(() => {
        if (!currentChatId || !currentChat?.agentId) {
            return [];
        }

        return (
            messages[
                getScopedChatStateKey(currentChatId, currentChat.agentId)
            ] ?? []
        );
    }, [currentChat?.agentId, currentChatId, messages]);
    const runtimeState = useMemo(
        () =>
            deriveConversationRuntimeState({
                messages: currentMessages,
                runSummaries,
                runtimeBinding,
            }),
        [currentMessages, runSummaries, runtimeBinding],
    );
    const conversationRuntimeBindings = useMemo(
        () =>
            buildConversationRuntimeBindingMap(
                workspaceConversationRuntimeBindings,
            ),
        [workspaceConversationRuntimeBindings],
    );
    const agentRuntimeActivitySummaries = useMemo(
        () => workspaceAgentRuntimeActivitySummaries ?? [],
        [workspaceAgentRuntimeActivitySummaries],
    );

    useEffect(() => {
        currentChatScopeRef.current = currentChat
            ? getScopedChatStateKey(currentChat.id, currentChat.agentId)
            : null;
    }, [currentChat]);

    useEffect(() => {
        currentChatRef.current = currentChat;
    }, [currentChat]);

    const applyChatLastViewedAt = useCallback(
        (chatId: string, agentId: string, timestamp: number) => {
            const scopedChatKey = getScopedChatStateKey(chatId, agentId);
            setChats((prev) =>
                prev.map((chat) =>
                    getScopedChatStateKey(chat.id, chat.agentId) ===
                    scopedChatKey
                        ? {
                              ...chat,
                              lastViewedAt: Math.max(
                                  chat.lastViewedAt ?? 0,
                                  timestamp,
                              ),
                          }
                        : chat,
                ),
            );
            setCurrentChat((prev) =>
                prev &&
                getScopedChatStateKey(prev.id, prev.agentId) === scopedChatKey
                    ? {
                          ...prev,
                          lastViewedAt: Math.max(
                              prev.lastViewedAt ?? 0,
                              timestamp,
                          ),
                      }
                    : prev,
            );
        },
        [],
    );

    const loadChats = useCallback(async () => {
        if (!selectedAgentId) {
            setChats([]);
            setCurrentChat(null);
            setMessages({});
            setIsMessagesLoading(false);
            return;
        }

        setIsLoading(true);
        setError(null);
        try {
            const loadedChats = await adapter.getAllChats();
            const scopedChats = loadedChats
                .filter((chat) => chat.agentId === selectedAgentId)
                .sort((a, b) => b.updatedAt - a.updatedAt);
            setChats(scopedChats);
        } catch {
            setError("Failed to load chats");
        } finally {
            setIsLoading(false);
        }
    }, [adapter, selectedAgentId]);

    useEffect(() => {
        if (!selectedAgentId) {
            setChats([]);
            setCurrentChat(null);
            return;
        }
        if (!isWorkspaceActive || !workspaceChats) return;

        const mapped = workspaceChats
            .map(mapConvexChatToSession)
            .filter((chat) => chat.agentId === selectedAgentId);
        const pending = pendingChatIdsRef.current;
        for (const chat of mapped) {
            pending.delete(chat.id);
        }

        setChats((prev) =>
            mergeByIdWithPending(
                mapped,
                prev.filter((chat) => chat.agentId === selectedAgentId),
                pending,
                (a, b) => b.updatedAt - a.updatedAt,
            ),
        );
    }, [isWorkspaceActive, selectedAgentId, workspaceChats]);

    useEffect(() => {
        if (!isWorkspaceActive || !workspaceCurrentChat || !workspaceMessages) {
            return;
        }

        const chatLocalId =
            workspaceCurrentChat.localId ?? workspaceCurrentChat._id;
        const scopedChatKey = getScopedChatStateKey(
            chatLocalId,
            workspaceCurrentChat.agentId,
        );
        const mapped = workspaceMessages.map((msg) =>
            mapConvexMessageToMessage(msg, chatLocalId),
        );
        const pending = pendingMessageIdsRef.current;
        for (const message of mapped) {
            pending.delete(message.id);
        }

        setMessages((prev) => ({
            ...prev,
            [scopedChatKey]: mergeByIdWithPending(
                mapped,
                prev[scopedChatKey] ?? [],
                pending,
                (a, b) => a.createdAt - b.createdAt,
            ),
        }));
        setIsMessagesLoading(false);
    }, [isWorkspaceActive, workspaceCurrentChat, workspaceMessages]);

    useEffect(() => {
        if (!isWorkspaceActive || !currentChatId) return;
        if (workspaceCurrentChat && workspaceMessages) return;
        setIsMessagesLoading(true);
    }, [
        currentChatId,
        isWorkspaceActive,
        workspaceCurrentChat,
        workspaceMessages,
    ]);

    useEffect(() => {
        if (!currentChat) {
            return;
        }

        const currentChatKey = getScopedChatStateKey(
            currentChat.id,
            currentChat.agentId,
        );
        const lastMessageAt = messages[currentChatKey]?.at(-1)?.createdAt ?? 0;
        const lastRuntimeEventAt =
            conversationRuntimeBindings[currentChatKey]?.lastEventAt ?? 0;
        const visibleAt = Math.max(
            lastMessageAt,
            lastRuntimeEventAt,
            currentChat.updatedAt,
            currentChat.createdAt,
        );
        const alreadyViewedAt = Math.max(
            currentChat.lastViewedAt ?? 0,
            latestViewedAtRef.current[currentChatKey] ?? 0,
        );

        if (visibleAt <= alreadyViewedAt) {
            return;
        }

        latestViewedAtRef.current[currentChatKey] = visibleAt;
        applyChatLastViewedAt(currentChat.id, currentChat.agentId, visibleAt);

        const pendingViewed = pendingViewedChatRef.current;
        if (
            pendingViewed &&
            getScopedChatStateKey(
                pendingViewed.chatId,
                pendingViewed.agentId,
            ) !== currentChatKey &&
            markViewedTimeoutRef.current
        ) {
            clearTimeout(markViewedTimeoutRef.current);
            void adapter.markChatViewed(
                pendingViewed.chatId,
                pendingViewed.timestamp,
                pendingViewed.agentId,
            );
            markViewedTimeoutRef.current = null;
            pendingViewedChatRef.current = null;
        } else if (markViewedTimeoutRef.current) {
            clearTimeout(markViewedTimeoutRef.current);
        }

        pendingViewedChatRef.current = {
            agentId: currentChat.agentId,
            chatId: currentChat.id,
            timestamp: visibleAt,
        };
        markViewedTimeoutRef.current = setTimeout(() => {
            const pending = pendingViewedChatRef.current;
            if (!pending) {
                return;
            }
            const { chatId, timestamp } = pending;
            void adapter.markChatViewed(chatId, timestamp, pending.agentId);
            pendingViewedChatRef.current = null;
            markViewedTimeoutRef.current = null;
        }, 300);
    }, [
        adapter,
        applyChatLastViewedAt,
        conversationRuntimeBindings,
        currentChat,
        messages,
    ]);

    const createChat = useCallback(
        async (title?: string, modelId?: string): Promise<ChatSession> => {
            const now = Date.now();
            const chatId = uuidv4();

            const chat: ChatSession = {
                id: chatId,
                agentId:
                    selectedAgentId ?? defaultAgentId ?? "mobile-default-agent",
                title: title || "New Chat",
                modelId: modelId || defaultModelId,
                variantId: selectedVariantId,
                settingsLockedAt: null,
                createdAt: now,
                updatedAt: now,
            };

            await adapter.createChat(chat);
            if (isWorkspaceActive) {
                pendingChatIdsRef.current.add(chat.id);
            }

            setChats((prev) => [chat, ...prev]);
            setCurrentChat(chat);
            setMessages((prev) => ({
                ...prev,
                [getScopedChatStateKey(chatId, chat.agentId)]: [],
            }));
            if (chat.agentId) {
                await setSelectedChatId(chat.agentId, chat.id);
            }

            return chat;
        },
        [
            adapter,
            defaultModelId,
            isWorkspaceActive,
            defaultAgentId,
            selectedVariantId,
            selectedAgentId,
        ],
    );

    const loadMessages = useCallback(
        async (chatId: string, agentId?: string) => {
            setIsMessagesLoading(true);
            try {
                const resolvedAgentId = agentId ?? selectedAgentId ?? null;
                const loadedMessages = await adapter.getMessagesByChat(
                    chatId,
                    resolvedAgentId ?? undefined,
                );
                if (!resolvedAgentId) {
                    return;
                }
                setMessages((prev) => ({
                    ...prev,
                    [getScopedChatStateKey(chatId, resolvedAgentId)]:
                        loadedMessages,
                }));
            } catch {
                console.error("Failed to load messages");
            } finally {
                setIsMessagesLoading(false);
            }
        },
        [adapter, selectedAgentId],
    );

    useEffect(() => {
        let cancelled = false;

        if (!selectedAgentId) {
            setCurrentChat(null);
            setIsMessagesLoading(false);
            return;
        }

        const currentChatStillInScope =
            currentChatRef.current?.agentId === selectedAgentId &&
            currentChatScopeRef.current &&
            chats.some(
                (chat) =>
                    getScopedChatStateKey(chat.id, chat.agentId) ===
                    currentChatScopeRef.current,
            );
        if (currentChatStillInScope) {
            return;
        }

        void (async () => {
            const storedChatId = await getSelectedChatId(selectedAgentId);
            const nextChat =
                chats.find(
                    (chat) =>
                        chat.id === storedChatId &&
                        chat.agentId === selectedAgentId,
                ) ??
                chats[0] ??
                null;
            if (cancelled) {
                return;
            }

            setCurrentChat(nextChat);
            if (nextChat) {
                await loadMessages(nextChat.id, nextChat.agentId);
            } else {
                setIsMessagesLoading(false);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [chats, loadMessages, selectedAgentId]);

    const selectChat = useCallback(
        async (chatId: string) => {
            const chat = chats.find(
                (c) => c.id === chatId && c.agentId === selectedAgentId,
            );
            if (chat) {
                setCurrentChat(chat);
                if (selectedAgentId) {
                    await setSelectedChatId(selectedAgentId, chat.id);
                }
                await loadMessages(chatId, chat.agentId);
            }
        },
        [chats, loadMessages, selectedAgentId],
    );

    const deleteChat = useCallback(
        async (chatId: string) => {
            const deletedChat =
                chats.find(
                    (c) => c.id === chatId && c.agentId === selectedAgentId,
                ) ?? null;
            const deletedChatAgentId =
                deletedChat?.agentId ??
                selectedAgentId ??
                currentChat?.agentId ??
                null;

            const deletedChatId = await adapter.deleteChat(
                chatId,
                deletedChatAgentId ?? undefined,
            );

            if (deletedChat) {
                void getSharedAgentchatSocketClient().notifyConversationDeleted(
                    chatId,
                    deletedChat.agentId,
                    getBackendSessionToken,
                    deletedChatId ?? undefined,
                );
            }

            setChats((prev) =>
                prev.filter(
                    (c) =>
                        getScopedChatStateKey(c.id, c.agentId) !==
                        getScopedChatStateKey(chatId, deletedChatAgentId),
                ),
            );
            setCurrentChat((prev) =>
                prev &&
                getScopedChatStateKey(prev.id, prev.agentId) ===
                    getScopedChatStateKey(chatId, deletedChatAgentId)
                    ? null
                    : prev,
            );
            setMessages((prev) => {
                const next = { ...prev };
                if (deletedChat?.agentId) {
                    delete next[
                        getScopedChatStateKey(chatId, deletedChat.agentId)
                    ];
                }
                return next;
            });
            if (
                selectedAgentId &&
                deletedChatAgentId &&
                currentChatScopeRef.current ===
                    getScopedChatStateKey(chatId, deletedChatAgentId)
            ) {
                await clearSelectedChatId(selectedAgentId);
            }
        },
        [adapter, chats, currentChat, selectedAgentId, getBackendSessionToken],
    );

    const deleteChats = useCallback(
        async (chatIds: string[]) => {
            if (chatIds.length === 0) return;

            const socketClient = getSharedAgentchatSocketClient();
            for (const chatId of chatIds) {
                const chat = chats.find((c) => c.id === chatId) ?? null;
                const deletedChatId = await adapter.deleteChat(
                    chatId,
                    chat?.agentId ?? selectedAgentId ?? undefined,
                );
                if (chat) {
                    void socketClient.notifyConversationDeleted(
                        chatId,
                        chat.agentId,
                        getBackendSessionToken,
                        deletedChatId ?? undefined,
                    );
                }
            }

            const chatScopeKeys = new Set(
                chatIds
                    .map(
                        (chatId) =>
                            chats.find(
                                (candidate) => candidate.id === chatId,
                            ) ?? null,
                    )
                    .filter((chat): chat is ChatSession => chat !== null)
                    .map((chat) =>
                        getScopedChatStateKey(chat.id, chat.agentId),
                    ),
            );
            setChats((prev) =>
                prev.filter(
                    (c) =>
                        !chatScopeKeys.has(
                            getScopedChatStateKey(c.id, c.agentId),
                        ),
                ),
            );
            setCurrentChat((prev) =>
                prev &&
                chatIds.some((id) => {
                    const chat =
                        chats.find((candidate) => candidate.id === id) ?? null;
                    return (
                        !!chat?.agentId &&
                        getScopedChatStateKey(prev.id, prev.agentId) ===
                            getScopedChatStateKey(id, chat.agentId)
                    );
                })
                    ? null
                    : prev,
            );
            setMessages((prev) => {
                const next = { ...prev };
                for (const chatId of chatIds) {
                    const chat = chats.find(
                        (candidate) => candidate.id === chatId,
                    );
                    if (!chat?.agentId) {
                        continue;
                    }
                    delete next[getScopedChatStateKey(chatId, chat.agentId)];
                }
                return next;
            });
            if (
                selectedAgentId &&
                currentChatScopeRef.current &&
                chatIds.some((chatId) => {
                    const chat =
                        chats.find((candidate) => candidate.id === chatId) ??
                        null;
                    return (
                        !!chat?.agentId &&
                        currentChatScopeRef.current ===
                            getScopedChatStateKey(chatId, chat.agentId)
                    );
                })
            ) {
                await clearSelectedChatId(selectedAgentId);
            }
        },
        [adapter, chats, selectedAgentId, getBackendSessionToken],
    );

    const updateChat = useCallback(
        async (chat: ChatSession) => {
            await adapter.updateChat(chat);
            setChats((prev) =>
                prev.map((c) =>
                    getScopedChatStateKey(c.id, c.agentId) ===
                    getScopedChatStateKey(chat.id, chat.agentId)
                        ? chat
                        : c,
                ),
            );
            setCurrentChat((prev) =>
                prev &&
                getScopedChatStateKey(prev.id, prev.agentId) ===
                    getScopedChatStateKey(chat.id, chat.agentId)
                    ? chat
                    : prev,
            );
        },
        [adapter],
    );

    const addMessage = useCallback(
        async (
            messageData: Omit<Message, "createdAt" | "id"> & { id?: string },
        ): Promise<Message> => {
            if (!currentChat) throw new Error("No current chat");

            const message: Message = {
                ...messageData,
                id: messageData.id ?? uuidv4(),
                createdAt: Date.now(),
            };

            await adapter.createMessage(message, currentChat.agentId);
            if (isWorkspaceActive) {
                pendingMessageIdsRef.current.add(message.id);
            }

            setMessages((prev) => {
                const currentChatKey = getScopedChatStateKey(
                    currentChat.id,
                    currentChat.agentId,
                );
                const chatMessages = prev[currentChatKey] || [];
                return {
                    ...prev,
                    [currentChatKey]: [...chatMessages, message],
                };
            });

            return message;
        },
        [adapter, currentChat, isWorkspaceActive],
    );

    const hasMessagesInChats = useCallback(
        async (chatIds: string[]): Promise<boolean> => {
            for (const chatId of chatIds) {
                const cachedMessages =
                    messages[
                        getScopedChatStateKey(chatId, selectedAgentId ?? null)
                    ];
                if (cachedMessages && cachedMessages.length > 0) {
                    return true;
                }

                if (cachedMessages) {
                    continue;
                }

                const storedMessages = await adapter.getMessagesByChat(
                    chatId,
                    selectedAgentId ?? undefined,
                );
                if (storedMessages.length > 0) {
                    return true;
                }
            }

            return false;
        },
        [adapter, messages, selectedAgentId],
    );

    const updateMessage = useCallback(
        async (message: Message) => {
            await adapter.updateMessage(message);

            if (currentChat) {
                const currentChatKey = getScopedChatStateKey(
                    currentChat.id,
                    currentChat.agentId,
                );
                setMessages((prev) => ({
                    ...prev,
                    [currentChatKey]: (prev[currentChatKey] || []).map((m) =>
                        m.id === message.id ? message : m,
                    ),
                }));
            }
        },
        [adapter, currentChat],
    );

    const insertMessage = useCallback(
        (message: Message) => {
            setMessages((prev) => {
                const chatMessages =
                    prev[
                        getScopedChatStateKey(
                            message.sessionId,
                            currentChat?.agentId ?? null,
                        )
                    ] || [];
                if (
                    chatMessages.some((existing) => existing.id === message.id)
                ) {
                    return prev;
                }
                return {
                    ...prev,
                    [getScopedChatStateKey(
                        message.sessionId,
                        currentChat?.agentId ?? null,
                    )]: [...chatMessages, message],
                };
            });
        },
        [currentChat?.agentId],
    );

    const patchMessage = useCallback(
        (
            id: string,
            chatId: string,
            updates: Partial<
                Pick<
                    Message,
                    "content" | "contextContent" | "reasoning" | "status"
                >
            >,
        ) => {
            const scopedChatKey = getScopedChatStateKey(
                chatId,
                currentChat?.agentId ?? null,
            );
            setMessages((prev) => {
                const chatMessages = prev[scopedChatKey] || [];
                return {
                    ...prev,
                    [scopedChatKey]: chatMessages.map((message) =>
                        message.id === id
                            ? { ...message, ...updates }
                            : message,
                    ),
                };
            });
        },
        [currentChat?.agentId],
    );

    useEffect(() => {
        setCurrentChat(null);
        setMessages({});
        setIsMessagesLoading(false);
        void loadChats();
    }, [adapter, loadChats]);

    return (
        <ChatContext.Provider
            value={{
                chats,
                currentChat,
                messages,
                runSummaries,
                runtimeState,
                conversationRuntimeBindings,
                agentRuntimeActivitySummaries,
                isLoading,
                isMessagesLoading,
                error,
                defaultModel: defaultModelId,
                loadChats,
                createChat,
                selectChat,
                deleteChat,
                deleteChats,
                updateChat,
                loadMessages,
                hasMessagesInChats,
                addMessage,
                insertMessage,
                updateMessage,
                patchMessage,
            }}
        >
            {children}
        </ChatContext.Provider>
    );
}
