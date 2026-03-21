import type { ChatSession } from "@shared/core/types";

const CHAT_ROUTE_SEPARATOR = ":";
const SCOPED_CHAT_ROUTE_PREFIX = "agent~";

function getScopedChatKey(
    chatId: string,
    agentId: string | null | undefined,
): string {
    return JSON.stringify([agentId ?? null, chatId]);
}

export function buildChatRouteId(params: {
    chatId: string;
    agentId: string;
}): string {
    return `${SCOPED_CHAT_ROUTE_PREFIX}${encodeURIComponent(params.agentId)}${CHAT_ROUTE_SEPARATOR}${encodeURIComponent(params.chatId)}`;
}

export function parseChatRouteId(routeId: string): {
    chatId: string;
    agentId: string | null;
} {
    if (!routeId.startsWith(SCOPED_CHAT_ROUTE_PREFIX)) {
        return {
            chatId: routeId,
            agentId: null,
        };
    }

    const encodedRouteId = routeId.slice(SCOPED_CHAT_ROUTE_PREFIX.length);
    const separatorIndex = encodedRouteId.indexOf(CHAT_ROUTE_SEPARATOR);
    if (separatorIndex < 0) {
        return {
            chatId: routeId,
            agentId: null,
        };
    }

    const encodedAgentId = encodedRouteId.slice(0, separatorIndex);
    const encodedChatId = encodedRouteId.slice(separatorIndex + 1);
    if (!encodedAgentId || !encodedChatId) {
        return {
            chatId: routeId,
            agentId: null,
        };
    }

    try {
        return {
            agentId: decodeURIComponent(encodedAgentId),
            chatId: decodeURIComponent(encodedChatId),
        };
    } catch {
        return {
            chatId: routeId,
            agentId: null,
        };
    }
}

export function getPreferredHomeChatRouteId(params: {
    currentChatId: string | null;
    currentChatAgentId: string | null;
    chats: ChatSession[];
}): string | null {
    const { currentChatId, currentChatAgentId, chats } = params;
    if (
        currentChatId &&
        currentChatAgentId &&
        chats.some(
            (chat) =>
                getScopedChatKey(chat.id, chat.agentId) ===
                getScopedChatKey(currentChatId, currentChatAgentId),
        )
    ) {
        return buildChatRouteId({
            chatId: currentChatId,
            agentId: currentChatAgentId,
        });
    }

    const fallbackChat = chats[0] ?? null;
    if (!fallbackChat) {
        return null;
    }

    return buildChatRouteId({
        chatId: fallbackChat.id,
        agentId: fallbackChat.agentId,
    });
}

export function resolveRouteChatSelection(params: {
    routeChatId: string;
    routeAgentId: string | null;
    chats: ChatSession[];
    currentChat: ChatSession | null;
}): ChatSession | null {
    const currentChat = params.currentChat;
    const matchingChats = params.chats.filter(
        (chat) => chat.id === params.routeChatId,
    );
    const routeChat = params.routeAgentId
        ? (matchingChats.find((chat) => chat.agentId === params.routeAgentId) ??
          null)
        : matchingChats.length === 1
          ? (matchingChats[0] ?? null)
          : currentChat &&
              matchingChats.some(
                  (chat) =>
                      getScopedChatKey(chat.id, chat.agentId) ===
                      getScopedChatKey(currentChat.id, currentChat.agentId),
              )
            ? currentChat
            : null;
    if (!routeChat) {
        return null;
    }

    if (
        params.currentChat &&
        getScopedChatKey(routeChat.id, routeChat.agentId) ===
            getScopedChatKey(params.currentChat.id, params.currentChat.agentId)
    ) {
        return null;
    }

    return routeChat;
}
