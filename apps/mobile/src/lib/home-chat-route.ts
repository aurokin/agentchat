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
    agentId: string;
} | null {
    if (!routeId.startsWith(SCOPED_CHAT_ROUTE_PREFIX)) {
        return null;
    }

    const encodedRouteId = routeId.slice(SCOPED_CHAT_ROUTE_PREFIX.length);
    const separatorIndex = encodedRouteId.indexOf(CHAT_ROUTE_SEPARATOR);
    if (separatorIndex < 0) {
        return null;
    }

    const encodedAgentId = encodedRouteId.slice(0, separatorIndex);
    const encodedChatId = encodedRouteId.slice(separatorIndex + 1);
    if (!encodedAgentId || !encodedChatId) {
        return null;
    }

    try {
        return {
            agentId: decodeURIComponent(encodedAgentId),
            chatId: decodeURIComponent(encodedChatId),
        };
    } catch {
        return null;
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
    routeAgentId: string;
    chats: ChatSession[];
    currentChat: ChatSession | null;
}): ChatSession | null {
    const routeChat =
        params.chats.find(
            (chat) =>
                getScopedChatKey(chat.id, chat.agentId) ===
                getScopedChatKey(params.routeChatId, params.routeAgentId),
        ) ?? null;
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
