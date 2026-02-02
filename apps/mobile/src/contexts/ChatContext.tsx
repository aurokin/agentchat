import React, {
    createContext,
    useContext,
    useState,
    useCallback,
    useEffect,
    type ReactNode,
} from "react";
import { useQuery } from "convex/react";
import { api } from "../../../web/convex/_generated/api";
import { useStorageAdapter, useSync } from "@/contexts/SyncContext";
import type {
    ChatSession,
    Message,
    ThinkingLevel,
    SearchLevel,
} from "@shared/core/types";
import { v4 as uuidv4 } from "uuid";
import {
    getDefaultThinking,
    setDefaultThinking as persistDefaultThinking,
    getDefaultSearchLevel,
    setDefaultSearchLevel as persistDefaultSearchLevel,
} from "@/lib/storage";
import { APP_DEFAULT_MODEL } from "@shared/core/models";
import { useModelContext } from "@/contexts/ModelContext";

interface ChatContextValue {
    chats: ChatSession[];
    currentChat: ChatSession | null;
    messages: Record<string, Message[]>;
    isLoading: boolean;
    error: string | null;
    defaultModel: string;
    defaultThinking: ThinkingLevel;
    defaultSearchLevel: SearchLevel;
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
    setDefaultSearchLevel: (searchLevel: SearchLevel) => void;
}

const ChatContext = createContext<ChatContextValue | null>(null);

const DEFAULT_THINKING: ThinkingLevel = "none";
const DEFAULT_SEARCH_LEVEL: SearchLevel = "none";

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
    const [error, setError] = useState<string | null>(null);
    const [defaultThinking, setDefaultThinkingState] =
        useState<ThinkingLevel>(DEFAULT_THINKING);
    const [defaultSearchLevel, setDefaultSearchLevelState] =
        useState<SearchLevel>(DEFAULT_SEARCH_LEVEL);
    const { selectedModel, selectModel, models } = useModelContext();
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
    const { syncState, isConvexAvailable, subscription } = useSync();
    const pendingChatIdsRef = React.useRef<Set<string>>(new Set());
    const pendingMessageIdsRef = React.useRef<Set<string>>(new Set());

    const isCloudSyncActive =
        isConvexAvailable &&
        syncState === "cloud-enabled" &&
        (subscription?.hasCloudSync ?? false);
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

    const mapCloudChat = useCallback(
        (chat: {
            _id: string;
            localId?: string | null;
            title: string;
            modelId: string;
            thinking: string;
            searchLevel: string;
            createdAt: number;
            updatedAt: number;
        }): ChatSession => {
            return {
                id: chat.localId ?? chat._id,
                title: chat.title,
                modelId: chat.modelId,
                thinking: chat.thinking as ChatSession["thinking"],
                searchLevel: chat.searchLevel as ChatSession["searchLevel"],
                createdAt: chat.createdAt,
                updatedAt: chat.updatedAt,
            };
        },
        [],
    );

    const mapCloudMessage = useCallback(
        (
            msg: {
                _id: string;
                localId?: string | null;
                role: Message["role"];
                content: string;
                contextContent: string;
                thinking?: string | null;
                skill?: any;
                modelId?: string | null;
                thinkingLevel?: string | null;
                searchLevel?: string | null;
                attachmentIds?: string[] | null;
                createdAt: number;
            },
            chatLocalId: string,
        ): Message => {
            return {
                id: msg.localId ?? msg._id,
                sessionId: chatLocalId,
                role: msg.role,
                content: msg.content,
                contextContent: msg.contextContent,
                thinking: msg.thinking ?? undefined,
                skill: (msg.skill as Message["skill"]) ?? null,
                modelId: msg.modelId ?? undefined,
                thinkingLevel:
                    (msg.thinkingLevel as Message["thinkingLevel"]) ??
                    undefined,
                searchLevel:
                    (msg.searchLevel as Message["searchLevel"]) ?? undefined,
                attachmentIds: msg.attachmentIds ?? undefined,
                createdAt: msg.createdAt,
            };
        },
        [],
    );

    const mergeChats = useCallback(
        (
            cloudList: ChatSession[],
            prev: ChatSession[],
            pending: Set<string>,
        ): ChatSession[] => {
            const byId = new Map<string, ChatSession>();
            for (const chat of cloudList) {
                byId.set(chat.id, chat);
            }
            for (const chat of prev) {
                if (pending.has(chat.id) && !byId.has(chat.id)) {
                    byId.set(chat.id, chat);
                }
            }
            return Array.from(byId.values()).sort(
                (a, b) => b.updatedAt - a.updatedAt,
            );
        },
        [],
    );

    const mergeMessages = useCallback(
        (
            cloudList: Message[],
            prev: Message[],
            pending: Set<string>,
        ): Message[] => {
            const byId = new Map<string, Message>();
            for (const message of cloudList) {
                byId.set(message.id, message);
            }
            for (const message of prev) {
                if (pending.has(message.id) && !byId.has(message.id)) {
                    byId.set(message.id, message);
                }
            }
            return Array.from(byId.values()).sort(
                (a, b) => a.createdAt - b.createdAt,
            );
        },
        [],
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

        const mapped = cloudChats.map(mapCloudChat);
        const pending = pendingChatIdsRef.current;
        for (const chat of mapped) {
            pending.delete(chat.id);
        }

        setChats((prev) => mergeChats(mapped, prev, pending));
        setCurrentChat((prev) => {
            if (!prev) return prev;
            return mapped.find((chat) => chat.id === prev.id) ?? prev;
        });
    }, [cloudChats, isCloudSyncActive, mapCloudChat, mergeChats]);

    useEffect(() => {
        if (!isCloudSyncActive || !cloudCurrentChat || !cloudMessages) {
            return;
        }

        const chatLocalId = cloudCurrentChat.localId ?? cloudCurrentChat._id;
        const mapped = cloudMessages.map((msg) =>
            mapCloudMessage(msg, chatLocalId),
        );
        const pending = pendingMessageIdsRef.current;
        for (const message of mapped) {
            pending.delete(message.id);
        }

        setMessages((prev) => ({
            ...prev,
            [chatLocalId]: mergeMessages(
                mapped,
                prev[chatLocalId] ?? [],
                pending,
            ),
        }));
    }, [
        cloudCurrentChat,
        cloudMessages,
        isCloudSyncActive,
        mapCloudMessage,
        mergeMessages,
    ]);

    const createChat = useCallback(
        async (title?: string, modelId?: string): Promise<ChatSession> => {
            const now = Date.now();
            const chatId = uuidv4();

            const chat: ChatSession = {
                id: chatId,
                title: title || "New Chat",
                modelId: modelId || defaultModelId,
                thinking: defaultThinking,
                searchLevel: defaultSearchLevel,
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
            defaultSearchLevel,
            isCloudSyncActive,
        ],
    );

    const loadMessages = useCallback(
        async (chatId: string) => {
            try {
                const loadedMessages = await adapter.getMessagesByChat(chatId);
                setMessages((prev) => ({ ...prev, [chatId]: loadedMessages }));
            } catch {
                console.error("Failed to load messages");
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

    const setDefaultSearchLevel = useCallback((searchLevel: SearchLevel) => {
        setDefaultSearchLevelState(searchLevel);
        void persistDefaultSearchLevel(searchLevel);
    }, []);

    useEffect(() => {
        setCurrentChat(null);
        setMessages({});
        loadChats();
    }, [adapter, loadChats]);

    useEffect(() => {
        let isMounted = true;
        const loadDefaults = async () => {
            const [thinking, search] = await Promise.all([
                getDefaultThinking(),
                getDefaultSearchLevel(),
            ]);
            if (isMounted) {
                setDefaultThinkingState(thinking);
                setDefaultSearchLevelState(search);
            }
        };
        loadDefaults();
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
                isLoading,
                error,
                defaultModel: defaultModelId,
                defaultThinking,
                defaultSearchLevel,
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
                setDefaultSearchLevel,
            }}
        >
            {children}
        </ChatContext.Provider>
    );
}
