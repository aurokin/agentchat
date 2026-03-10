"use client";

import React, {
    createContext,
    useContext,
    useEffect,
    useState,
    useCallback,
    useRef,
} from "react";
import { usePaginatedQuery, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type {
    ChatSession,
    Message,
    ThinkingLevel,
    SearchLevel,
} from "@/lib/types";
import { APP_DEFAULT_MODEL } from "@shared/core/models";
import {
    mapConvexChatToLocal,
    mapConvexMessageToLocal,
    mergeByIdWithPending,
} from "@shared/core/sync";
import { trackAnalyticsEvent } from "@/lib/analytics/posthog";
import { useStorageAdapter, useSync } from "@/contexts/SyncContext";
import * as storage from "@/lib/storage";
import { v4 as uuid } from "uuid";

interface ChatContextType {
    chats: ChatSession[];
    currentChat: ChatSession | null;
    messages: Message[];
    loading: boolean;
    isMessagesLoading: boolean;
    canLoadMoreChats: boolean;
    isChatsLoadingMore: boolean;
    loadMoreChats: () => void;
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
        modelId?: string;
        thinkingLevel?: ThinkingLevel;
        searchLevel?: SearchLevel;
        attachmentIds?: string[];
        chatId?: string;
    }) => Promise<Message>;
    updateMessage: (
        id: string,
        updates: Partial<
            Pick<
                Message,
                "content" | "contextContent" | "thinking" | "attachmentIds"
            >
        >,
    ) => Promise<void>;
    clearCurrentChat: () => void;
}

const ChatContext = createContext<ChatContextType | null>(null);

const CLOUD_CHAT_PAGE_SIZE = 50;

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
    const cloudChatsPagination = usePaginatedQuery(
        api.chats.listByUserPaginated,
        isCloudSyncActive && cloudUserId ? { userId: cloudUserId } : "skip",
        { initialNumItems: CLOUD_CHAT_PAGE_SIZE },
    );
    const cloudChats = cloudChatsPagination.results;
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

    useEffect(() => {
        currentChatIdRef.current = currentChat?.id ?? null;
    }, [currentChat?.id]);

    useEffect(() => {
        if (!isCloudSyncActive) return;

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

        setMessages((prev) =>
            mergeByIdWithPending(
                mapped,
                prev,
                pending,
                (a, b) => a.createdAt - b.createdAt,
            ),
        );
        setIsMessagesLoading(false);
    }, [cloudCurrentChat, cloudMessages, isCloudSyncActive]);

    useEffect(() => {
        if (!isCloudSyncActive) return;
        setLoading(cloudChatsPagination.status === "LoadingFirstPage");
    }, [cloudChatsPagination.status, isCloudSyncActive]);

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
        if (isCloudSyncActive) return;
        loadChats();
    }, [isCloudSyncActive, loadChats]);

    const canLoadMoreChats =
        isCloudSyncActive && cloudChatsPagination.status === "CanLoadMore";
    const isChatsLoadingMore =
        isCloudSyncActive && cloudChatsPagination.status === "LoadingMore";
    const loadMoreChats = useCallback(() => {
        if (!isCloudSyncActive) return;
        if (cloudChatsPagination.status !== "CanLoadMore") return;
        cloudChatsPagination.loadMore(CLOUD_CHAT_PAGE_SIZE);
    }, [cloudChatsPagination, isCloudSyncActive]);

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
            trackAnalyticsEvent("chat_created", {
                model: chat.modelId,
            });

            return chat;
        },
        [isCloudSyncActive, storageAdapter],
    );

    const selectChat = useCallback(
        async (chatId: string) => {
            if (isCloudSyncActive) {
                const chat = chats.find((candidate) => candidate.id === chatId);
                if (!chat) return;
                setCurrentChat(chat);
                // `cloudMessages` will populate `messages` reactively.
                setIsMessagesLoading(true);
                return;
            }

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
        [chats, isCloudSyncActive, storageAdapter],
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
                Pick<
                    Message,
                    "content" | "contextContent" | "thinking" | "attachmentIds"
                >
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
                canLoadMoreChats,
                isChatsLoadingMore,
                loadMoreChats,
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
