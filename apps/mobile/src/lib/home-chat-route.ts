import type { ChatSession } from "@shared/core/types";

function getScopedChatKey(
    chatId: string,
    agentId: string | null | undefined,
): string {
    return `${agentId ?? ""}:${chatId}`;
}

export function getPreferredHomeChatId(params: {
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
        return currentChatId;
    }

    return chats[0]?.id ?? null;
}

export function resolveRouteChatSelection(params: {
    routeChatId: string;
    chats: ChatSession[];
    currentChat: ChatSession | null;
}): ChatSession | null {
    const routeChat =
        params.chats.find((chat) => chat.id === params.routeChatId) ?? null;
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
