export function getConversationScopeKey(
    conversationId: string,
    agentId: string,
): string {
    return JSON.stringify([agentId, conversationId]);
}
