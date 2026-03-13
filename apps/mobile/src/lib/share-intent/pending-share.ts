export interface PendingSharePayload {
    text: string;
}

const payloadByChatId = new Map<string, PendingSharePayload>();

export function setPendingSharePayload(
    chatId: string,
    payload: PendingSharePayload,
): void {
    payloadByChatId.set(chatId, payload);
}

export function consumePendingSharePayload(
    chatId: string,
): PendingSharePayload | null {
    const payload = payloadByChatId.get(chatId);
    if (!payload) return null;
    payloadByChatId.delete(chatId);
    return payload;
}
