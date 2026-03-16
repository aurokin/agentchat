export type ConversationUnsubscribe = () => void;

export function clearBackgroundConversationSubscriptions(
    subscriptions: Map<string, ConversationUnsubscribe>,
): void {
    for (const unsubscribe of subscriptions.values()) {
        unsubscribe();
    }
    subscriptions.clear();
}

export function reconcileBackgroundConversationSubscriptions(params: {
    subscriptions: Map<string, ConversationUnsubscribe>;
    desiredConversationIds: Iterable<string>;
    subscribeToConversation: (
        conversationId: string,
    ) => ConversationUnsubscribe;
}): number {
    const desiredConversationIds = new Set(params.desiredConversationIds);

    for (const [conversationId, unsubscribe] of params.subscriptions) {
        if (desiredConversationIds.has(conversationId)) {
            continue;
        }

        unsubscribe();
        params.subscriptions.delete(conversationId);
    }

    for (const conversationId of desiredConversationIds) {
        if (params.subscriptions.has(conversationId)) {
            continue;
        }

        params.subscriptions.set(
            conversationId,
            params.subscribeToConversation(conversationId),
        );
    }

    return desiredConversationIds.size;
}
