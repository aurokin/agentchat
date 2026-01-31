import React, {
    createContext,
    useContext,
    useState,
    useCallback,
    useEffect,
    type ReactNode,
} from "react";
import { getSqliteStorageAdapter } from "../lib/sync/sqlite-adapter";
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
} from "../lib/storage";

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
    updateChat: (chat: ChatSession) => Promise<void>;
    loadMessages: (chatId: string) => Promise<void>;
    addMessage: (
        message: Omit<Message, "id" | "createdAt">,
    ) => Promise<Message>;
    updateMessage: (message: Message) => Promise<void>;
    setDefaultModel: (modelId: string) => void;
    setDefaultThinking: (thinking: ThinkingLevel) => void;
    setDefaultSearchLevel: (searchLevel: SearchLevel) => void;
}

const ChatContext = createContext<ChatContextValue | null>(null);

const DEFAULT_MODEL = "anthropic/claude-3-5-sonnet-20241022";
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
    const [defaultModel] = useState(DEFAULT_MODEL);
    const [defaultThinking, setDefaultThinkingState] =
        useState<ThinkingLevel>(DEFAULT_THINKING);
    const [defaultSearchLevel, setDefaultSearchLevelState] =
        useState<SearchLevel>(DEFAULT_SEARCH_LEVEL);

    const adapter = getSqliteStorageAdapter();

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
    }, []);

    const createChat = useCallback(
        async (title?: string, modelId?: string): Promise<ChatSession> => {
            const now = Date.now();
            const chatId = uuidv4();

            const chat: ChatSession = {
                id: chatId,
                title: title || "New Chat",
                modelId: modelId || defaultModel,
                thinking: defaultThinking,
                searchLevel: defaultSearchLevel,
                createdAt: now,
                updatedAt: now,
            };

            await adapter.createChat(chat);

            setChats((prev) => [chat, ...prev]);
            setCurrentChat(chat);
            setMessages((prev) => ({ ...prev, [chatId]: [] }));

            return chat;
        },
        [defaultModel, defaultThinking, defaultSearchLevel],
    );

    const selectChat = useCallback(
        async (chatId: string) => {
            const chat = chats.find((c) => c.id === chatId);
            if (chat) {
                setCurrentChat(chat);
                await loadMessages(chatId);
            }
        },
        [chats],
    );

    const deleteChat = useCallback(async (chatId: string) => {
        await adapter.deleteChat(chatId);

        setChats((prev) => prev.filter((c) => c.id !== chatId));
        setCurrentChat((prev) => (prev?.id === chatId ? null : prev));
        setMessages((prev) => {
            const next = { ...prev };
            delete next[chatId];
            return next;
        });
    }, []);

    const updateChat = useCallback(async (chat: ChatSession) => {
        await adapter.updateChat(chat);

        setChats((prev) => prev.map((c) => (c.id === chat.id ? chat : c)));
        setCurrentChat((prev) => (prev?.id === chat.id ? chat : prev));
    }, []);

    const loadMessages = useCallback(async (chatId: string) => {
        try {
            const loadedMessages = await adapter.getMessagesByChat(chatId);
            setMessages((prev) => ({ ...prev, [chatId]: loadedMessages }));
        } catch {
            console.error("Failed to load messages");
        }
    }, []);

    const addMessage = useCallback(
        async (
            messageData: Omit<Message, "id" | "createdAt">,
        ): Promise<Message> => {
            if (!currentChat) throw new Error("No current chat");

            const message: Message = {
                ...messageData,
                id: uuidv4(),
                createdAt: Date.now(),
            };

            await adapter.createMessage(message);

            setMessages((prev) => {
                const chatMessages = prev[currentChat.id] || [];
                return {
                    ...prev,
                    [currentChat.id]: [...chatMessages, message],
                };
            });

            return message;
        },
        [currentChat],
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
        [currentChat],
    );

    const setDefaultModel = useCallback((modelId: string) => {
        // This would persist to settings in a full implementation
    }, []);

    const setDefaultThinking = useCallback((thinking: ThinkingLevel) => {
        setDefaultThinkingState(thinking);
        void persistDefaultThinking(thinking);
    }, []);

    const setDefaultSearchLevel = useCallback((searchLevel: SearchLevel) => {
        setDefaultSearchLevelState(searchLevel);
        void persistDefaultSearchLevel(searchLevel);
    }, []);

    useEffect(() => {
        loadChats();
    }, [loadChats]);

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
                defaultModel,
                defaultThinking,
                defaultSearchLevel,
                loadChats,
                createChat,
                selectChat,
                deleteChat,
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
