"use client";

import React, {
    createContext,
    useContext,
    useEffect,
    useMemo,
    useState,
    useCallback,
    useRef,
} from "react";
import { usePaginatedQuery, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { FunctionReference } from "convex/server";
import type {
    ChatRunSummary,
    ConversationRuntimeState,
    ChatSession,
    Message,
    ThinkingLevel,
} from "@/lib/types";
import { APP_DEFAULT_MODEL } from "@shared/core/models";
import {
    mapConvexChatToLocal,
    mapConvexMessageToLocal,
    mergeByIdWithPending,
} from "@shared/core/sync";
import { useStorageAdapter, useSync } from "@/contexts/SyncContext";
import { useAgent } from "@/contexts/AgentContext";
import { getDefaultModelForAgent } from "@/contexts/agent-helpers";
import {
    filterChatsForAgent,
    resolveCurrentChatForAgent,
} from "@/contexts/chat-helpers";
import { deriveConversationRuntimeState } from "@/contexts/runtime-helpers";
import * as storage from "@/lib/storage";
import { v4 as uuid } from "uuid";

interface ChatContextType {
    chats: ChatSession[];
    currentChat: ChatSession | null;
    messages: Message[];
    runSummaries: ChatRunSummary[];
    runtimeState: ConversationRuntimeState;
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

const CLOUD_CHAT_PAGE_SIZE = 50;

const convexApi = api as typeof api & {
    runs: {
        listByChat: FunctionReference<"query">;
    };
};

export function ChatProvider({ children }: { children: React.ReactNode }) {
    const storageAdapter = useStorageAdapter();
    const { isWorkspaceReady, isConvexAvailable } = useSync();
    const { selectedAgentId, selectedAgent, loadingAgents } = useAgent();
    const [chats, setChats] = useState<ChatSession[]>([]);
    const [currentChat, setCurrentChat] = useState<ChatSession | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [loading, setLoading] = useState(true);
    const [isMessagesLoading, setIsMessagesLoading] = useState(false);
    const currentChatIdRef = useRef<string | null>(null);
    const pendingChatIdsRef = useRef<Set<string>>(new Set());
    const pendingMessageIdsRef = useRef<Set<string>>(new Set());

    const isCloudSyncActive = isConvexAvailable && isWorkspaceReady;
    const currentChatId = currentChat?.id ?? null;
    const cloudUserId = useQuery(
        api.users.getCurrentUserId,
        isCloudSyncActive ? {} : "skip",
    );
    const cloudChatsPagination = usePaginatedQuery(
        api.chats.listByUserAndAgentPaginated,
        isCloudSyncActive && cloudUserId && selectedAgentId
            ? {
                  userId: cloudUserId,
                  agentId: selectedAgentId,
              }
            : "skip",
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
    const runtimeState = useMemo(
        () =>
            deriveConversationRuntimeState({
                messages,
                runSummaries,
            }),
        [messages, runSummaries],
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
        setCurrentChat((prev) =>
            resolveCurrentChatForAgent({
                chats: mapped,
                currentChat: prev,
                storedChatId: selectedAgentId
                    ? storage.getSelectedChatId(selectedAgentId)
                    : null,
            }),
        );
    }, [cloudChats, isCloudSyncActive, selectedAgentId]);

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
        if (!selectedAgentId) {
            setChats([]);
            setCurrentChat(null);
            setMessages([]);
            setIsMessagesLoading(false);
            setLoading(false);
            return;
        }

        try {
            const allChats = await storageAdapter.getAllChats();
            const migratedChats = await Promise.all(
                allChats.map(async (chat) => {
                    const needsAgentId = !chat.agentId;
                    const needsSettingsLock =
                        chat.settingsLockedAt === undefined;

                    if (!needsAgentId && !needsSettingsLock) {
                        return chat;
                    }

                    const migratedChat = {
                        ...chat,
                        agentId: chat.agentId || selectedAgentId,
                        settingsLockedAt: chat.settingsLockedAt ?? null,
                    };
                    await storageAdapter.updateChat(migratedChat);
                    return migratedChat;
                }),
            );
            const scopedChats = filterChatsForAgent(
                migratedChats,
                selectedAgentId,
            );
            setChats(scopedChats);

            const storedChatId = storage.getSelectedChatId(selectedAgentId);
            const activeChatId = currentChatIdRef.current ?? storedChatId;
            if (!activeChatId) {
                setCurrentChat(null);
                setMessages([]);
                setIsMessagesLoading(false);
                return;
            }

            setIsMessagesLoading(true);
            const refreshedChat = await storageAdapter.getChat(activeChatId);

            if (!refreshedChat || refreshedChat.agentId !== selectedAgentId) {
                if (storedChatId === activeChatId) {
                    storage.clearSelectedChatId(selectedAgentId);
                }
                if (currentChatIdRef.current === activeChatId || storedChatId) {
                    setCurrentChat(null);
                    setMessages([]);
                }
                setIsMessagesLoading(false);
            } else {
                storage.setSelectedChatId(selectedAgentId, refreshedChat.id);
                setCurrentChat(refreshedChat);
                const chatMessages = await storageAdapter.getMessagesByChat(
                    refreshedChat.id,
                );
                if (
                    currentChatIdRef.current === refreshedChat.id ||
                    storedChatId
                ) {
                    setMessages(chatMessages);
                }
                setIsMessagesLoading(false);
            }
        } finally {
            setLoading(false);
        }
    }, [selectedAgentId, storageAdapter]);

    useEffect(() => {
        if (loadingAgents) return;
        setCurrentChat(null);
        setMessages([]);
        setIsMessagesLoading(false);
        if (!selectedAgentId) {
            setChats([]);
            setLoading(false);
            return;
        }
        if (isCloudSyncActive) {
            return;
        }

        setLoading(true);
        void loadChats();
    }, [isCloudSyncActive, loadChats, loadingAgents, selectedAgentId]);

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
            if (!selectedAgentId) {
                throw new Error("No agent selected");
            }

            const defaultModel = getDefaultModelForAgent({
                agent: selectedAgent,
                fallbackModel:
                    storage.getDefaultModel(selectedAgentId) ||
                    APP_DEFAULT_MODEL,
            });
            const defaultThinking = storage.getDefaultThinking(selectedAgentId);
            const chat: ChatSession = {
                id: uuid(),
                agentId: selectedAgentId,
                title: title || "New Chat",
                modelId: modelId || defaultModel,
                thinking: defaultThinking,
                settingsLockedAt: null,
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
            storage.setSelectedChatId(selectedAgentId, chat.id);

            return chat;
        },
        [isCloudSyncActive, selectedAgent, selectedAgentId, storageAdapter],
    );

    const selectChat = useCallback(
        async (chatId: string) => {
            if (isCloudSyncActive) {
                const chat = chats.find((candidate) => candidate.id === chatId);
                if (!chat) return;
                setCurrentChat(chat);
                storage.setSelectedChatId(chat.agentId, chat.id);
                // `cloudMessages` will populate `messages` reactively.
                setIsMessagesLoading(true);
                return;
            }

            const chat = await storageAdapter.getChat(chatId);
            if (chat && chat.agentId === selectedAgentId) {
                setCurrentChat(chat);
                storage.setSelectedChatId(chat.agentId, chat.id);
                setIsMessagesLoading(true);
                const chatMessages =
                    await storageAdapter.getMessagesByChat(chatId);
                setMessages(chatMessages);
                setIsMessagesLoading(false);
                return;
            }
            setIsMessagesLoading(false);
        },
        [chats, isCloudSyncActive, selectedAgentId, storageAdapter],
    );

    const deleteChat = useCallback(
        async (chatId: string) => {
            await storageAdapter.deleteChat(chatId);
            setChats((prev) => prev.filter((c) => c.id !== chatId));

            const deletedChat =
                currentChat?.id === chatId
                    ? currentChat
                    : (chats.find((candidate) => candidate.id === chatId) ??
                      null);
            if (deletedChat) {
                storage.clearSelectedChatId(deletedChat.agentId);
            }

            if (currentChat?.id === chatId) {
                setCurrentChat(null);
                setMessages([]);
                setIsMessagesLoading(false);
            }
        },
        [chats, currentChat, storageAdapter],
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
                runSummaries,
                runtimeState,
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
