import type { ChatSession } from "@shared/core/types";

export function getPreferredHomeChatId(params: {
    currentChatId: string | null;
    chats: ChatSession[];
}): string | null {
    if (
        params.currentChatId &&
        params.chats.some((chat) => chat.id === params.currentChatId)
    ) {
        return params.currentChatId;
    }

    return params.chats[0]?.id ?? null;
}
