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
    selectedAgentId: string | null;
    storedChatId?: string | null;
}): ChatSession | null {
    const { chats, currentChat, selectedAgentId, storedChatId } = params;
    if (!selectedAgentId) {
        return null;
    }

    if (currentChat?.agentId === selectedAgentId) {
        const scopedCurrentChat =
            chats.find(
                (chat) =>
                    chat.id === currentChat.id &&
                    chat.agentId === selectedAgentId,
            ) ?? null;
        if (scopedCurrentChat) {
            return scopedCurrentChat;
        }
    }

    if (!storedChatId) {
        return null;
    }

    const matches = chats.filter(
        (chat) => chat.id === storedChatId && chat.agentId === selectedAgentId,
    );
    return matches.length === 1 ? (matches[0] ?? null) : null;
}
