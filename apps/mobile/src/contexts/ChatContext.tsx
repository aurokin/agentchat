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
import type { ChatRunSummary, ConversationRuntimeState } from "@/lib/types";
import {
    APP_DEFAULT_MODEL,
    resolveThinkingLevelForVariant,
} from "@shared/core/models";
import {
    mapConvexChatToSession,
    mapConvexMessageToMessage,
    mergeByIdWithPending,
} from "@shared/core/sync";
import { v4 as uuidv4 } from "uuid";
import {
    getSelectedChatId,
    setSelectedChatId,
    clearSelectedChatId,
} from "@/lib/storage";
import { useModelContext } from "@/contexts/ModelContext";
import { deriveConversationRuntimeState } from "@/contexts/runtime-helpers";
import { useAgent } from "@/contexts/AgentContext";

interface ChatContextValue {
    chats: ChatSession[];
    currentChat: ChatSession | null;
    messages: Record<string, Message[]>;
    runSummaries: ChatRunSummary[];
    runtimeState: ConversationRuntimeState;
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
    loadMessages: (chatId: string) => Promise<void>;
    hasMessagesInChats: (chatIds: string[]) => Promise<boolean>;
    addMessage: (
        message: Omit<Message, "createdAt" | "id"> & { id?: string },
    ) => Promise<Message>;
    updateMessage: (message: Message) => Promise<void>;
    setDefaultModel: (modelId: string) => void;
}

const ChatContext = createContext<ChatContextValue | null>(null);

const convexApi = api as typeof api & {
    runs: {
        listByChat: FunctionReference<"query">;
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
    const {
        defaultAgentId,
        selectedModel,
        selectedVariantId,
        selectModel,
        models,
    } = useModelContext();
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
    const { isWorkspaceReady, isConvexAvailable } = useWorkspace();
    const pendingChatIdsRef = React.useRef<Set<string>>(new Set());
    const pendingMessageIdsRef = React.useRef<Set<string>>(new Set());
    const currentChatIdRef = useRef<string | null>(null);

    const isWorkspaceActive = isConvexAvailable && isWorkspaceReady;
    const currentChatId = currentChat?.id ?? null;
    const workspaceUserId = useQuery(
        api.users.getCurrentUserId,
        isWorkspaceActive ? {} : "skip",
    );
    const workspaceChats = useQuery(
        api.chats.listByUser,
        isWorkspaceActive && workspaceUserId
            ? { userId: workspaceUserId }
            : "skip",
    );
    const workspaceCurrentChat = useQuery(
        api.chats.getByLocalId,
        isWorkspaceActive && workspaceUserId && currentChatId
            ? { userId: workspaceUserId, localId: currentChatId }
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
    const runSummaries = useMemo(
        () => workspaceRunSummaries ?? [],
        [workspaceRunSummaries],
    );
    const currentMessages = useMemo(() => {
        if (!currentChatId) {
            return [];
        }

        return messages[currentChatId] ?? [];
    }, [currentChatId, messages]);
    const runtimeState = useMemo(
        () =>
            deriveConversationRuntimeState({
                messages: currentMessages,
                runSummaries,
            }),
        [currentMessages, runSummaries],
    );

    useEffect(() => {
        currentChatIdRef.current = currentChat?.id ?? null;
    }, [currentChat?.id]);

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
        const mapped = workspaceMessages.map((msg) =>
            mapConvexMessageToMessage(msg, chatLocalId),
        );
        const pending = pendingMessageIdsRef.current;
        for (const message of mapped) {
            pending.delete(message.id);
        }

        setMessages((prev) => ({
            ...prev,
            [chatLocalId]: mergeByIdWithPending(
                mapped,
                prev[chatLocalId] ?? [],
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
                thinking: resolveThinkingLevelForVariant(selectedVariantId),
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
            setMessages((prev) => ({ ...prev, [chatId]: [] }));
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
        async (chatId: string) => {
            setIsMessagesLoading(true);
            try {
                const loadedMessages = await adapter.getMessagesByChat(chatId);
                setMessages((prev) => ({ ...prev, [chatId]: loadedMessages }));
            } catch {
                console.error("Failed to load messages");
            } finally {
                setIsMessagesLoading(false);
            }
        },
        [adapter],
    );

    useEffect(() => {
        let cancelled = false;

        if (!selectedAgentId) {
            setCurrentChat(null);
            setIsMessagesLoading(false);
            return;
        }

        const currentChatStillInScope =
            currentChatIdRef.current &&
            chats.some((chat) => chat.id === currentChatIdRef.current);
        if (currentChatStillInScope) {
            return;
        }

        void (async () => {
            const storedChatId = await getSelectedChatId(selectedAgentId);
            const nextChat =
                chats.find((chat) => chat.id === storedChatId) ??
                chats[0] ??
                null;
            if (cancelled) {
                return;
            }

            setCurrentChat(nextChat);
            if (nextChat) {
                await loadMessages(nextChat.id);
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
            const chat = chats.find((c) => c.id === chatId);
            if (chat) {
                setCurrentChat(chat);
                if (selectedAgentId) {
                    await setSelectedChatId(selectedAgentId, chat.id);
                }
                await loadMessages(chatId);
            }
        },
        [chats, loadMessages, selectedAgentId],
    );

    const deleteChat = useCallback(
        async (chatId: string) => {
            await adapter.deleteChat(chatId);

            setChats((prev) => prev.filter((c) => c.id !== chatId));
            setCurrentChat((prev) => (prev?.id === chatId ? null : prev));
            setMessages((prev) => {
                const next = { ...prev };
                delete next[chatId];
                return next;
            });
            if (selectedAgentId && currentChatIdRef.current === chatId) {
                await clearSelectedChatId(selectedAgentId);
            }
        },
        [adapter, selectedAgentId],
    );

    const deleteChats = useCallback(
        async (chatIds: string[]) => {
            if (chatIds.length === 0) return;

            for (const chatId of chatIds) {
                await adapter.deleteChat(chatId);
            }

            const chatIdSet = new Set(chatIds);
            setChats((prev) => prev.filter((c) => !chatIdSet.has(c.id)));
            setCurrentChat((prev) =>
                prev && chatIdSet.has(prev.id) ? null : prev,
            );
            setMessages((prev) => {
                const next = { ...prev };
                for (const chatId of chatIds) {
                    delete next[chatId];
                }
                return next;
            });
            if (
                selectedAgentId &&
                currentChatIdRef.current &&
                chatIdSet.has(currentChatIdRef.current)
            ) {
                await clearSelectedChatId(selectedAgentId);
            }
        },
        [adapter, selectedAgentId],
    );

    const updateChat = useCallback(
        async (chat: ChatSession) => {
            await adapter.updateChat(chat);

            setChats((prev) => prev.map((c) => (c.id === chat.id ? chat : c)));
            setCurrentChat((prev) => (prev?.id === chat.id ? chat : prev));
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

            await adapter.createMessage(message);
            if (isWorkspaceActive) {
                pendingMessageIdsRef.current.add(message.id);
            }

            setMessages((prev) => {
                const chatMessages = prev[currentChat.id] || [];
                return {
                    ...prev,
                    [currentChat.id]: [...chatMessages, message],
                };
            });

            return message;
        },
        [adapter, currentChat, isWorkspaceActive],
    );

    const hasMessagesInChats = useCallback(
        async (chatIds: string[]): Promise<boolean> => {
            for (const chatId of chatIds) {
                const cachedMessages = messages[chatId];
                if (cachedMessages && cachedMessages.length > 0) {
                    return true;
                }

                if (cachedMessages) {
                    continue;
                }

                const storedMessages = await adapter.getMessagesByChat(chatId);
                if (storedMessages.length > 0) {
                    return true;
                }
            }

            return false;
        },
        [adapter, messages],
    );

    const updateMessage = useCallback(
        async (message: Message) => {
            await adapter.updateMessage(message);

            if (currentChat) {
                setMessages((prev) => ({
                    ...prev,
                    [currentChat.id]: (prev[currentChat.id] || []).map((m) =>
                        m.id === message.id ? message : m,
                    ),
                }));
            }
        },
        [adapter, currentChat],
    );

    const setDefaultModel = useCallback(
        (modelId: string) => {
            void selectModel(modelId);
        },
        [selectModel],
    );

    useEffect(() => {
        setCurrentChat(null);
        setMessages({});
        setIsMessagesLoading(false);
        loadChats();
    }, [adapter, loadChats]);

    return (
        <ChatContext.Provider
            value={{
                chats,
                currentChat,
                messages,
                runSummaries,
                runtimeState,
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
                updateMessage,
                setDefaultModel,
            }}
        >
            {children}
        </ChatContext.Provider>
    );
}
