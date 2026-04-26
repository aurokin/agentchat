import type { ConversationRuntimeBindingSummary } from "@/lib/types";
import type { Message } from "@shared/core/types";

export function getScopedChatStateKey(
    chatId: string,
    agentId: string | null | undefined,
): string {
    return JSON.stringify([agentId ?? null, chatId]);
}

export function buildConversationRuntimeBindingMap(
    bindings: ConversationRuntimeBindingSummary[] | undefined,
): Record<string, ConversationRuntimeBindingSummary> {
    return Object.fromEntries(
        (bindings ?? []).map((binding) => [
            getScopedChatStateKey(binding.conversationId, binding.agentId),
            binding,
        ]),
    ) as Record<string, ConversationRuntimeBindingSummary>;
}

export function insertScopedMessage(
    state: Record<string, Message[]>,
    message: Message,
    agentId: string | null | undefined,
): Record<string, Message[]> {
    const scopedChatKey = getScopedChatStateKey(message.sessionId, agentId);
    const chatMessages = state[scopedChatKey] || [];
    if (chatMessages.some((existing) => existing.id === message.id)) {
        return state;
    }

    return {
        ...state,
        [scopedChatKey]: [...chatMessages, message],
    };
}

export function replaceScopedMessage(
    state: Record<string, Message[]>,
    message: Message,
    agentId: string | null | undefined,
): Record<string, Message[]> {
    const scopedChatKey = getScopedChatStateKey(message.sessionId, agentId);
    const chatMessages = state[scopedChatKey] || [];

    return {
        ...state,
        [scopedChatKey]: chatMessages.map((existing) =>
            existing.id === message.id ? message : existing,
        ),
    };
}

export function patchScopedMessage(
    state: Record<string, Message[]>,
    params: {
        id: string;
        chatId: string;
        agentId: string | null | undefined;
        updates: Partial<
            Pick<
                Message,
                "content" | "contextContent" | "reasoning" | "status" | "kind"
            >
        >;
    },
): Record<string, Message[]> {
    const scopedChatKey = getScopedChatStateKey(params.chatId, params.agentId);
    const chatMessages = state[scopedChatKey] || [];

    return {
        ...state,
        [scopedChatKey]: chatMessages.map((message) =>
            message.id === params.id
                ? { ...message, ...params.updates }
                : message,
        ),
    };
}
