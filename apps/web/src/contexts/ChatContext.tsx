"use client";

import React, {
    createContext,
    useContext,
    useEffect,
    useState,
    useCallback,
} from "react";
import type {
    ChatSession,
    Message,
    Skill,
    ThinkingLevel,
    SearchLevel,
} from "@/lib/types";
import { useStorageAdapter } from "@/contexts/SyncContext";
import * as storage from "@/lib/storage";
import { v4 as uuid } from "uuid";

interface ChatContextType {
    chats: ChatSession[];
    currentChat: ChatSession | null;
    messages: Message[];
    loading: boolean;
    createChat: (title?: string, modelId?: string) => Promise<ChatSession>;
    selectChat: (chatId: string) => Promise<void>;
    deleteChat: (chatId: string) => Promise<void>;
    updateChat: (chat: ChatSession) => Promise<void>;
    addMessage: (message: {
        id?: string;
        role: string;
        content: string;
        contextContent: string;
        thinking?: string;
        skill?: Skill | null;
        modelId?: string;
        thinkingLevel?: ThinkingLevel;
        searchLevel?: SearchLevel;
        attachmentIds?: string[];
        chatId?: string;
    }) => Promise<Message>;
    updateMessage: (
        id: string,
        updates: Partial<
            Pick<Message, "content" | "contextContent" | "thinking">
        >,
    ) => Promise<void>;
    clearCurrentChat: () => void;
}

const ChatContext = createContext<ChatContextType | null>(null);

export function ChatProvider({ children }: { children: React.ReactNode }) {
    const storageAdapter = useStorageAdapter();
    const [chats, setChats] = useState<ChatSession[]>([]);
    const [currentChat, setCurrentChat] = useState<ChatSession | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [loading, setLoading] = useState(true);

    const loadChats = useCallback(async () => {
        try {
            const allChats = await storageAdapter.getAllChats();
            setChats(allChats);

            if (currentChat) {
                const refreshedChat = await storageAdapter.getChat(
                    currentChat.id,
                );

                if (!refreshedChat) {
                    setCurrentChat(null);
                    setMessages([]);
                } else {
                    setCurrentChat(refreshedChat);
                    const chatMessages = await storageAdapter.getMessagesByChat(
                        refreshedChat.id,
                    );
                    setMessages(chatMessages);
                }
            }
        } finally {
            setLoading(false);
        }
    }, [currentChat, storageAdapter]);

    // Load chats on mount and when adapter changes
    useEffect(() => {
        loadChats();
    }, [loadChats]);

    const createChat = useCallback(
        async (title?: string, modelId?: string): Promise<ChatSession> => {
            const defaultModel =
                storage.getDefaultModel() || "minimax/minimax-m2.1";
            const defaultThinking = storage.getDefaultThinking();
            const defaultSearchLevel = storage.getDefaultSearchLevel();
            const chat: ChatSession = {
                id: uuid(),
                title: title || "New Chat",
                modelId: modelId || defaultModel,
                thinking: defaultThinking,
                searchLevel: defaultSearchLevel,
                createdAt: Date.now(),
                updatedAt: Date.now(),
            };

            await storageAdapter.createChat(chat);
            setChats((prev) => [chat, ...prev]);
            setCurrentChat(chat);
            setMessages([]);

            return chat;
        },
        [storageAdapter],
    );

    const selectChat = useCallback(
        async (chatId: string) => {
            const chat = await storageAdapter.getChat(chatId);
            if (chat) {
                setCurrentChat(chat);
                const chatMessages =
                    await storageAdapter.getMessagesByChat(chatId);
                setMessages(chatMessages);
            }
        },
        [storageAdapter],
    );

    const deleteChat = useCallback(
        async (chatId: string) => {
            await storageAdapter.deleteChat(chatId);
            setChats((prev) => prev.filter((c) => c.id !== chatId));

            if (currentChat?.id === chatId) {
                setCurrentChat(null);
                setMessages([]);
            }
        },
        [currentChat, storageAdapter],
    );

    const updateChat = useCallback(
        async (chat: ChatSession) => {
            const updated = { ...chat, updatedAt: Date.now() };
            await storageAdapter.updateChat(updated);
            setChats((prev) =>
                prev.map((c) => (c.id === chat.id ? updated : c)),
            );
            if (currentChat?.id === chat.id) {
                setCurrentChat(updated);
            }
        },
        [currentChat, storageAdapter],
    );

    const addMessage = useCallback(
        async (message: {
            id?: string;
            role: string;
            content: string;
            contextContent: string;
            thinking?: string;
            skill?: Skill | null;
            modelId?: string;
            thinkingLevel?: ThinkingLevel;
            searchLevel?: SearchLevel;
            attachmentIds?: string[];
            chatId?: string;
        }): Promise<Message> => {
            const targetChatId = message.chatId ?? currentChat?.id;
            if (!targetChatId) {
                throw new Error("No current chat selected");
            }

            const newMessage: Message = {
                role: message.role as Message["role"],
                content: message.content,
                contextContent: message.contextContent,
                thinking: message.thinking,
                skill: message.skill,
                modelId: message.modelId,
                thinkingLevel: message.thinkingLevel,
                searchLevel: message.searchLevel,
                attachmentIds: message.attachmentIds,
                sessionId: targetChatId,
                id: message.id ?? uuid(),
                createdAt: Date.now(),
            };

            await storageAdapter.createMessage(newMessage);
            if (currentChat?.id === targetChatId) {
                setMessages((prev) => [...prev, newMessage]);
            }

            const baseChat = await storageAdapter.getChat(targetChatId);
            if (baseChat ?? (currentChat?.id === targetChatId && currentChat)) {
                const updated = {
                    ...(baseChat ?? currentChat!),
                    updatedAt: Date.now(),
                };
                await storageAdapter.updateChat(updated);
                setChats((prev) => {
                    if (!prev.some((c) => c.id === updated.id)) {
                        return prev;
                    }
                    return prev.map((c) => (c.id === updated.id ? updated : c));
                });
                if (currentChat?.id === updated.id) {
                    setCurrentChat(updated);
                }
            }

            return newMessage;
        },
        [currentChat, storageAdapter],
    );

    const updateMessage = useCallback(
        async (
            id: string,
            updates: Partial<
                Pick<Message, "content" | "contextContent" | "thinking">
            >,
        ) => {
            let updatedMessage: Message | undefined;

            setMessages((prev) => {
                const message = prev.find((m) => m.id === id);
                if (!message) return prev;

                const updated = { ...message, ...updates };
                updatedMessage = updated;

                return prev.map((m) => (m.id === id ? updated : m));
            });

            if (updatedMessage) {
                await storageAdapter.updateMessage(updatedMessage);
                return;
            }

            if (currentChat) {
                const chatMessages = await storageAdapter.getMessagesByChat(
                    currentChat.id,
                );
                const message = chatMessages.find((m) => m.id === id);
                if (message) {
                    await storageAdapter.updateMessage({
                        ...message,
                        ...updates,
                    });
                }
            }
        },
        [currentChat, storageAdapter],
    );

    const clearCurrentChat = useCallback(() => {
        setCurrentChat(null);
        setMessages([]);
    }, []);

    return (
        <ChatContext.Provider
            value={{
                chats,
                currentChat,
                messages,
                loading,
                createChat,
                selectChat,
                deleteChat,
                updateChat,
                addMessage,
                updateMessage,
                clearCurrentChat,
            }}
        >
            {children}
        </ChatContext.Provider>
    );
}

export function useChat() {
    const context = useContext(ChatContext);
    if (!context) {
        throw new Error("useChat must be used within a ChatProvider");
    }
    return context;
}
