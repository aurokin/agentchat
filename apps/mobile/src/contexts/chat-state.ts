import type { ConversationRuntimeBindingSummary } from "@/lib/types";

export function getScopedChatStateKey(
    chatId: string,
    agentId: string | null | undefined,
): string {
    return `${agentId ?? ""}:${chatId}`;
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
