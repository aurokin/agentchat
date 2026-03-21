import type { ChatSession } from "@/lib/types";

export function filterChatsForAgent(
    chats: ChatSession[],
    agentId: string | null,
): ChatSession[] {
    if (!agentId) {
        return [];
    }

    return chats.filter((chat) => chat.agentId === agentId);
}

export function resolveCurrentChatForAgent(params: {
    chats: ChatSession[];
    currentChat: ChatSession | null;
    storedChatId?: string | null;
}): ChatSession | null {
    const { chats, currentChat, storedChatId } = params;
    if (currentChat) {
        return (
            chats.find(
                (chat) =>
                    chat.id === currentChat.id &&
                    chat.agentId === currentChat.agentId,
            ) ?? null
        );
    }

    if (!storedChatId) {
        return null;
    }

    const matches = chats.filter((chat) => chat.id === storedChatId);
    return matches.length === 1 ? (matches[0] ?? null) : null;
}
