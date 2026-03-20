export type ConversationUnsubscribe = () => void;
export type ConversationSubscriptionTarget = {
    conversationId: string;
    agentId: string;
};

function getConversationSubscriptionKey(
    target: ConversationSubscriptionTarget,
): string {
    return `${target.agentId}:${target.conversationId}`;
}

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
    desiredConversations: Iterable<ConversationSubscriptionTarget>;
    subscribeToConversation: (
        target: ConversationSubscriptionTarget,
    ) => ConversationUnsubscribe;
}): number {
    const desiredConversations = new Map<
        string,
        ConversationSubscriptionTarget
    >();
    for (const target of params.desiredConversations) {
        desiredConversations.set(
            getConversationSubscriptionKey(target),
            target,
        );
    }

    for (const [conversationKey, unsubscribe] of params.subscriptions) {
        if (desiredConversations.has(conversationKey)) {
            continue;
        }

        unsubscribe();
        params.subscriptions.delete(conversationKey);
    }

    for (const [conversationKey, target] of desiredConversations) {
        if (params.subscriptions.has(conversationKey)) {
            continue;
        }

        params.subscriptions.set(
            conversationKey,
            params.subscribeToConversation(target),
        );
    }

    return desiredConversations.size;
}
