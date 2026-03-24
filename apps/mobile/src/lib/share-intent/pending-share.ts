export interface PendingSharePayload {
    text: string;
}

const payloadByConversationKey = new Map<string, PendingSharePayload>();

function getPendingShareKey(chatId: string, agentId: string): string {
    return JSON.stringify([agentId, chatId]);
}

export function setPendingSharePayload(
    chatId: string,
    agentId: string,
    payload: PendingSharePayload,
): void {
    payloadByConversationKey.set(getPendingShareKey(chatId, agentId), payload);
}

export function consumePendingSharePayload(
    chatId: string,
    agentId: string,
): PendingSharePayload | null {
    const key = getPendingShareKey(chatId, agentId);
    const payload = payloadByConversationKey.get(key);
    if (!payload) return null;
    payloadByConversationKey.delete(key);
    return payload;
}
