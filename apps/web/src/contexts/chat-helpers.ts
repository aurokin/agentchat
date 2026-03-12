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
}): ChatSession | null {
    const { chats, currentChat } = params;
    if (!currentChat) {
        return null;
    }

    return chats.find((chat) => chat.id === currentChat.id) ?? null;
}
