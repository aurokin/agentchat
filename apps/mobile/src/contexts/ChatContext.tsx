import React, {
    createContext,
    useContext,
    useState,
    useCallback,
    useEffect,
    useMemo,
    type ReactNode,
} from "react";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { FunctionReference } from "convex/server";
import { useStorageAdapter, useSync } from "@/contexts/SyncContext";
import type { ChatSession, Message, ThinkingLevel } from "@shared/core/types";
import type { ChatRunSummary, ConversationRuntimeState } from "@/lib/types";
import {
    mapConvexChatToLocal,
    mapConvexMessageToLocal,
    mergeByIdWithPending,
} from "@shared/core/sync";
import { v4 as uuidv4 } from "uuid";
import {
    getDefaultThinking,
    setDefaultThinking as persistDefaultThinking,
} from "@/lib/storage";
import { APP_DEFAULT_MODEL } from "@shared/core/models";
import { useModelContext } from "@/contexts/ModelContext";
import { deriveConversationRuntimeState } from "@/contexts/runtime-helpers";

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
    defaultThinking: ThinkingLevel;
    loadChats: () => Promise<void>;
    createChat: (title?: string, modelId?: string) => Promise<ChatSession>;
    selectChat: (chatId: string) => Promise<void>;
    deleteChat: (chatId: string) => Promise<void>;
    deleteChats: (chatIds: string[]) => Promise<void>;
    updateChat: (chat: ChatSession) => Promise<void>;
    loadMessages: (chatId: string) => Promise<void>;
    addMessage: (
        message: Omit<Message, "createdAt" | "id"> & { id?: string },
    ) => Promise<Message>;
    updateMessage: (message: Message) => Promise<void>;
    setDefaultModel: (modelId: string) => void;
    setDefaultThinking: (thinking: ThinkingLevel) => void;
}

const ChatContext = createContext<ChatContextValue | null>(null);

const DEFAULT_THINKING: ThinkingLevel = "none";

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
    const [defaultThinking, setDefaultThinkingState] =
        useState<ThinkingLevel>(DEFAULT_THINKING);
    const { defaultAgentId, selectedModel, selectModel, models } =
        useModelContext();
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

    const adapter = useStorageAdapter();
    const { syncState, isConvexAvailable } = useSync();
    const pendingChatIdsRef = React.useRef<Set<string>>(new Set());
    const pendingMessageIdsRef = React.useRef<Set<string>>(new Set());

    const isCloudSyncActive =
        isConvexAvailable && syncState === "cloud-enabled";
    const currentChatId = currentChat?.id ?? null;
    const cloudUserId = useQuery(
        api.users.getCurrentUserId,
        isCloudSyncActive ? {} : "skip",
    );
    const cloudChats = useQuery(
        api.chats.listByUser,
        isCloudSyncActive && cloudUserId ? { userId: cloudUserId } : "skip",
    );
    const cloudCurrentChat = useQuery(
        api.chats.getByLocalId,
        isCloudSyncActive && cloudUserId && currentChatId
            ? { userId: cloudUserId, localId: currentChatId }
            : "skip",
    );
    const cloudMessages = useQuery(
        api.messages.listByChat,
        isCloudSyncActive && cloudCurrentChat?._id
            ? { chatId: cloudCurrentChat._id }
            : "skip",
    );
    const cloudRunSummaries = useQuery(
        convexApi.runs.listByChat,
        isCloudSyncActive && cloudCurrentChat?._id
            ? { chatId: cloudCurrentChat._id }
            : "skip",
    );
    const runSummaries = useMemo(
        () => cloudRunSummaries ?? [],
        [cloudRunSummaries],
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

    const loadChats = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const loadedChats = await adapter.getAllChats();
            setChats(loadedChats.sort((a, b) => b.updatedAt - a.updatedAt));
        } catch {
            setError("Failed to load chats");
        } finally {
            setIsLoading(false);
        }
    }, [adapter]);

    useEffect(() => {
        if (!isCloudSyncActive || !cloudChats) return;

        const mapped = cloudChats.map(mapConvexChatToLocal);
        const pending = pendingChatIdsRef.current;
        for (const chat of mapped) {
            pending.delete(chat.id);
        }

        setChats((prev) =>
            mergeByIdWithPending(
                mapped,
                prev,
                pending,
                (a, b) => b.updatedAt - a.updatedAt,
            ),
        );
        setCurrentChat((prev) => {
            if (!prev) return prev;
            return mapped.find((chat) => chat.id === prev.id) ?? prev;
        });
    }, [cloudChats, isCloudSyncActive]);

    useEffect(() => {
        if (!isCloudSyncActive || !cloudCurrentChat || !cloudMessages) {
            return;
        }

        const chatLocalId = cloudCurrentChat.localId ?? cloudCurrentChat._id;
        const mapped = cloudMessages.map((msg) =>
            mapConvexMessageToLocal(msg, chatLocalId),
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
    }, [cloudCurrentChat, cloudMessages, isCloudSyncActive]);

    useEffect(() => {
        if (!isCloudSyncActive || !currentChatId) return;
        if (cloudCurrentChat && cloudMessages) return;
        setIsMessagesLoading(true);
    }, [cloudCurrentChat, cloudMessages, currentChatId, isCloudSyncActive]);

    const createChat = useCallback(
        async (title?: string, modelId?: string): Promise<ChatSession> => {
            const now = Date.now();
            const chatId = uuidv4();

            const chat: ChatSession = {
                id: chatId,
                agentId: defaultAgentId ?? "mobile-default-agent",
                title: title || "New Chat",
                modelId: modelId || defaultModelId,
                thinking: defaultThinking,
                settingsLockedAt: null,
                createdAt: now,
                updatedAt: now,
            };

            await adapter.createChat(chat);
            if (isCloudSyncActive) {
                pendingChatIdsRef.current.add(chat.id);
            }

            setChats((prev) => [chat, ...prev]);
            setCurrentChat(chat);
            setMessages((prev) => ({ ...prev, [chatId]: [] }));

            return chat;
        },
        [
            adapter,
            defaultModelId,
            defaultThinking,
            isCloudSyncActive,
            defaultAgentId,
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

    const selectChat = useCallback(
        async (chatId: string) => {
            const chat = chats.find((c) => c.id === chatId);
            if (chat) {
                setCurrentChat(chat);
                await loadMessages(chatId);
            }
        },
        [chats, loadMessages],
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
        },
        [adapter],
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
        },
        [adapter],
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
            if (isCloudSyncActive) {
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
        [adapter, currentChat, isCloudSyncActive],
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

    const setDefaultThinking = useCallback((thinking: ThinkingLevel) => {
        setDefaultThinkingState(thinking);
        void persistDefaultThinking(thinking);
    }, []);

    useEffect(() => {
        setCurrentChat(null);
        setMessages({});
        setIsMessagesLoading(false);
        loadChats();
    }, [adapter, loadChats]);

    useEffect(() => {
        let isMounted = true;
        const loadDefaults = async () => {
            const thinking = await getDefaultThinking();
            if (isMounted) {
                setDefaultThinkingState(thinking);
            }
        };
        void loadDefaults();
        return () => {
            isMounted = false;
        };
    }, []);

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
                defaultThinking,
                loadChats,
                createChat,
                selectChat,
                deleteChat,
                deleteChats,
                updateChat,
                loadMessages,
                addMessage,
                updateMessage,
                setDefaultModel,
                setDefaultThinking,
            }}
        >
            {children}
        </ChatContext.Provider>
    );
}
