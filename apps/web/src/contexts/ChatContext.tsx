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
    mapConvexChatToSession,
    mapConvexMessageToMessage,
    mergeByIdWithPending,
} from "@shared/core/persistence";
import {
    usePersistenceAdapter,
    useWorkspace,
} from "@/contexts/WorkspaceContext";
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
    const persistenceAdapter = usePersistenceAdapter();
    const { isWorkspaceReady, isConvexAvailable, workspaceUserId } =
        useWorkspace();
    const { selectedAgentId, selectedAgent, loadingAgents } = useAgent();
    const [chats, setChats] = useState<ChatSession[]>([]);
    const [currentChat, setCurrentChat] = useState<ChatSession | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [loading, setLoading] = useState(true);
    const [isMessagesLoading, setIsMessagesLoading] = useState(false);
    const currentChatIdRef = useRef<string | null>(null);
    const pendingChatIdsRef = useRef<Set<string>>(new Set());
    const pendingMessageIdsRef = useRef<Set<string>>(new Set());

    const isWorkspaceActive = isConvexAvailable && isWorkspaceReady;
    const currentChatId = currentChat?.id ?? null;
    const workspaceChatsPagination = usePaginatedQuery(
        api.chats.listByUserAndAgentPaginated,
        isWorkspaceActive && workspaceUserId && selectedAgentId
            ? {
                  userId: workspaceUserId,
                  agentId: selectedAgentId,
              }
            : "skip",
        { initialNumItems: CLOUD_CHAT_PAGE_SIZE },
    );
    const workspaceChats = workspaceChatsPagination.results;
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
        if (!isWorkspaceActive) return;

        const mapped = workspaceChats.map(mapConvexChatToSession);
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

        setMessages((prev) =>
            mergeByIdWithPending(
                mapped,
                prev,
                pending,
                (a, b) => a.createdAt - b.createdAt,
            ),
        );
        setIsMessagesLoading(false);
    }, [isWorkspaceActive, workspaceCurrentChat, workspaceMessages]);

    useEffect(() => {
        if (!isWorkspaceActive) return;
        setLoading(workspaceChatsPagination.status === "LoadingFirstPage");
    }, [isWorkspaceActive, workspaceChatsPagination.status]);

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
            const allChats = await persistenceAdapter.getAllChats();
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
                    await persistenceAdapter.updateChat(migratedChat);
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
            const refreshedChat =
                await persistenceAdapter.getChat(activeChatId);

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
                const chatMessages = await persistenceAdapter.getMessagesByChat(
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
    }, [persistenceAdapter, selectedAgentId]);

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
        if (isWorkspaceActive) {
            return;
        }

        setLoading(true);
        void loadChats();
    }, [isWorkspaceActive, loadChats, loadingAgents, selectedAgentId]);

    const canLoadMoreChats =
        isWorkspaceActive && workspaceChatsPagination.status === "CanLoadMore";
    const isChatsLoadingMore =
        isWorkspaceActive && workspaceChatsPagination.status === "LoadingMore";
    const loadMoreChats = useCallback(() => {
        if (!isWorkspaceActive) return;
        if (workspaceChatsPagination.status !== "CanLoadMore") return;
        workspaceChatsPagination.loadMore(CLOUD_CHAT_PAGE_SIZE);
    }, [isWorkspaceActive, workspaceChatsPagination]);

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

            await persistenceAdapter.createChat(chat);
            if (isWorkspaceActive) {
                pendingChatIdsRef.current.add(chat.id);
            }
            setChats((prev) => [chat, ...prev]);
            setCurrentChat(chat);
            setMessages([]);
            setIsMessagesLoading(false);
            storage.setSelectedChatId(selectedAgentId, chat.id);

            return chat;
        },
        [isWorkspaceActive, persistenceAdapter, selectedAgent, selectedAgentId],
    );

    const selectChat = useCallback(
        async (chatId: string) => {
            if (isWorkspaceActive) {
                const chat = chats.find((candidate) => candidate.id === chatId);
                if (!chat) return;
                setCurrentChat(chat);
                storage.setSelectedChatId(chat.agentId, chat.id);
                // `workspaceMessages` will populate `messages` reactively.
                setIsMessagesLoading(true);
                return;
            }

            const chat = await persistenceAdapter.getChat(chatId);
            if (chat && chat.agentId === selectedAgentId) {
                setCurrentChat(chat);
                storage.setSelectedChatId(chat.agentId, chat.id);
                setIsMessagesLoading(true);
                const chatMessages =
                    await persistenceAdapter.getMessagesByChat(chatId);
                setMessages(chatMessages);
                setIsMessagesLoading(false);
                return;
            }
            setIsMessagesLoading(false);
        },
        [chats, isWorkspaceActive, persistenceAdapter, selectedAgentId],
    );

    const deleteChat = useCallback(
        async (chatId: string) => {
            await persistenceAdapter.deleteChat(chatId);
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
        [chats, currentChat, persistenceAdapter],
    );

    const updateChat = useCallback(
        async (chat: ChatSession) => {
            const updated = { ...chat, updatedAt: Date.now() };
            await persistenceAdapter.updateChat(updated);
            setChats((prev) =>
                prev.map((c) => (c.id === chat.id ? updated : c)),
            );
            if (currentChat?.id === chat.id) {
                setCurrentChat(updated);
            }
        },
        [currentChat, persistenceAdapter],
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

            await persistenceAdapter.createMessage(newMessage);
            if (isWorkspaceActive) {
                pendingMessageIdsRef.current.add(newMessage.id);
            }
            if (currentChat?.id === targetChatId) {
                setMessages((prev) => [...prev, newMessage]);
            }

            const baseChat = await persistenceAdapter.getChat(targetChatId);
            if (baseChat ?? (currentChat?.id === targetChatId && currentChat)) {
                const updated = {
                    ...(baseChat ?? currentChat!),
                    updatedAt: Date.now(),
                };
                await persistenceAdapter.updateChat(updated);
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
        [currentChat, isWorkspaceActive, persistenceAdapter],
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
                await persistenceAdapter.updateMessage(updatedMessage);
                return;
            }

            if (currentChat) {
                const chatMessages = await persistenceAdapter.getMessagesByChat(
                    currentChat.id,
                );
                const message = chatMessages.find((m) => m.id === id);
                if (message) {
                    await persistenceAdapter.updateMessage({
                        ...message,
                        ...updates,
                    });
                }
            }
        },
        [currentChat, persistenceAdapter],
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
