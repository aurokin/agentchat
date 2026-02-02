"use client";

import React, {
    createContext,
    useContext,
    useEffect,
    useState,
    useCallback,
    useRef,
} from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type {
    ChatSession,
    Message,
    Skill,
    ThinkingLevel,
    SearchLevel,
} from "@/lib/types";
import { APP_DEFAULT_MODEL } from "@shared/core/models";
import { useStorageAdapter, useSync } from "@/contexts/SyncContext";
import * as storage from "@/lib/storage";
import { v4 as uuid } from "uuid";

interface ChatContextType {
    chats: ChatSession[];
    currentChat: ChatSession | null;
    messages: Message[];
    loading: boolean;
    isMessagesLoading: boolean;
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
    const { syncState, isConvexAvailable, subscription } = useSync();
    const [chats, setChats] = useState<ChatSession[]>([]);
    const [currentChat, setCurrentChat] = useState<ChatSession | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [loading, setLoading] = useState(true);
    const [isMessagesLoading, setIsMessagesLoading] = useState(false);
    const currentChatIdRef = useRef<string | null>(null);
    const pendingChatIdsRef = useRef<Set<string>>(new Set());
    const pendingMessageIdsRef = useRef<Set<string>>(new Set());

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
                skill?: Skill | null;
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
                skill: msg.skill ?? null,
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

    useEffect(() => {
        currentChatIdRef.current = currentChat?.id ?? null;
    }, [currentChat?.id]);

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

        setMessages((prev) => mergeMessages(mapped, prev, pending));
        setIsMessagesLoading(false);
    }, [
        cloudCurrentChat,
        cloudMessages,
        isCloudSyncActive,
        mapCloudMessage,
        mergeMessages,
    ]);

    useEffect(() => {
        if (!isCloudSyncActive || !currentChatId) return;
        if (cloudCurrentChat && cloudMessages) return;
        setIsMessagesLoading(true);
    }, [cloudCurrentChat, cloudMessages, currentChatId, isCloudSyncActive]);

    const loadChats = useCallback(async () => {
        try {
            const allChats = await storageAdapter.getAllChats();
            setChats(allChats);

            const activeChatId = currentChatIdRef.current;
            if (activeChatId) {
                setIsMessagesLoading(true);
                const refreshedChat =
                    await storageAdapter.getChat(activeChatId);

                if (!refreshedChat) {
                    if (currentChatIdRef.current === activeChatId) {
                        setCurrentChat(null);
                        setMessages([]);
                    }
                    setIsMessagesLoading(false);
                } else {
                    setCurrentChat(refreshedChat);
                    const chatMessages = await storageAdapter.getMessagesByChat(
                        refreshedChat.id,
                    );
                    if (currentChatIdRef.current === refreshedChat.id) {
                        setMessages(chatMessages);
                    }
                    setIsMessagesLoading(false);
                }
            } else {
                setIsMessagesLoading(false);
            }
        } finally {
            setLoading(false);
        }
    }, [storageAdapter]);

    // Load chats on mount and when adapter changes
    useEffect(() => {
        loadChats();
    }, [loadChats]);

    const createChat = useCallback(
        async (title?: string, modelId?: string): Promise<ChatSession> => {
            const defaultModel = storage.getDefaultModel() || APP_DEFAULT_MODEL;
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
            if (isCloudSyncActive) {
                pendingChatIdsRef.current.add(chat.id);
            }
            setChats((prev) => [chat, ...prev]);
            setCurrentChat(chat);
            setMessages([]);
            setIsMessagesLoading(false);

            return chat;
        },
        [isCloudSyncActive, storageAdapter],
    );

    const selectChat = useCallback(
        async (chatId: string) => {
            const chat = await storageAdapter.getChat(chatId);
            if (chat) {
                setCurrentChat(chat);
                setIsMessagesLoading(true);
                const chatMessages =
                    await storageAdapter.getMessagesByChat(chatId);
                setMessages(chatMessages);
                setIsMessagesLoading(false);
                return;
            }
            setIsMessagesLoading(false);
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
                setIsMessagesLoading(false);
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
            if (isCloudSyncActive) {
                pendingMessageIdsRef.current.add(newMessage.id);
            }
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
        [currentChat, isCloudSyncActive, storageAdapter],
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
        setIsMessagesLoading(false);
    }, []);

    return (
        <ChatContext.Provider
            value={{
                chats,
                currentChat,
                messages,
                loading,
                isMessagesLoading,
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
