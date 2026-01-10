"use client";

import React, {
    createContext,
    useContext,
    useEffect,
    useState,
    useCallback,
} from "react";
import type { ChatSession, Message, Skill, ThinkingLevel } from "@/lib/types";
import * as db from "@/lib/db";
import * as storage from "@/lib/storage";
import { useSettings } from "./SettingsContext";
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
        role: string;
        content: string;
        contextContent: string;
        thinking?: string;
        skill?: Skill | null;
        modelId?: string;
        thinkingLevel?: ThinkingLevel;
        searchEnabled?: boolean;
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
    const [chats, setChats] = useState<ChatSession[]>([]);
    const [currentChat, setCurrentChat] = useState<ChatSession | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [loading, setLoading] = useState(true);

    // Load chats on mount
    useEffect(() => {
        loadChats();
    }, []);

    const loadChats = async () => {
        try {
            const allChats = await db.getAllChats();
            setChats(allChats);
        } finally {
            setLoading(false);
        }
    };

    const createChat = useCallback(
        async (title?: string, modelId?: string): Promise<ChatSession> => {
            const defaultModel =
                storage.getDefaultModel() || "minimax/minimax-m2.1";
            const defaultThinking = storage.getDefaultThinking();
            const defaultSearch = storage.getDefaultSearchEnabled();
            const chat: ChatSession = {
                id: uuid(),
                title: title || "New Chat",
                modelId: modelId || defaultModel,
                thinking: defaultThinking,
                searchEnabled: defaultSearch,
                createdAt: Date.now(),
                updatedAt: Date.now(),
            };

            await db.createChat(chat);
            setChats((prev) => [chat, ...prev]);
            setCurrentChat(chat);
            setMessages([]);

            return chat;
        },
        [],
    );

    const selectChat = useCallback(async (chatId: string) => {
        const chat = await db.getChat(chatId);
        if (chat) {
            setCurrentChat(chat);
            const chatMessages = await db.getMessagesByChat(chatId);
            setMessages(chatMessages);
        }
    }, []);

    const deleteChat = useCallback(
        async (chatId: string) => {
            await db.deleteChat(chatId);
            setChats((prev) => prev.filter((c) => c.id !== chatId));

            if (currentChat?.id === chatId) {
                setCurrentChat(null);
                setMessages([]);
            }
        },
        [currentChat],
    );

    const updateChat = useCallback(
        async (chat: ChatSession) => {
            const updated = { ...chat, updatedAt: Date.now() };
            await db.updateChat(updated);
            setChats((prev) =>
                prev.map((c) => (c.id === chat.id ? updated : c)),
            );
            if (currentChat?.id === chat.id) {
                setCurrentChat(updated);
            }
        },
        [currentChat],
    );

    const addMessage = useCallback(
        async (message: {
            role: string;
            content: string;
            contextContent: string;
            thinking?: string;
            skill?: Skill | null;
            modelId?: string;
            thinkingLevel?: ThinkingLevel;
            searchEnabled?: boolean;
        }): Promise<Message> => {
            if (!currentChat) {
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
                searchEnabled: message.searchEnabled,
                sessionId: currentChat.id,
                id: uuid(),
                createdAt: Date.now(),
            };

            await db.createMessage(newMessage);
            setMessages((prev) => [...prev, newMessage]);

            if (currentChat) {
                const updated = { ...currentChat, updatedAt: Date.now() };
                await db.updateChat(updated);
                setChats((prev) =>
                    prev.map((c) => (c.id === currentChat.id ? updated : c)),
                );
            }

            return newMessage;
        },
        [currentChat],
    );

    const updateMessage = useCallback(
        async (
            id: string,
            updates: Partial<
                Pick<Message, "content" | "contextContent" | "thinking">
            >,
        ) => {
            setMessages((prev) => {
                const message = prev.find((m) => m.id === id);
                if (!message) return prev;

                const updated = { ...message, ...updates };
                db.updateMessage(updated);

                return prev.map((m) => (m.id === id ? updated : m));
            });
        },
        [],
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
