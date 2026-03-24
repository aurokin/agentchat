import type { PersistenceAdapter } from "@shared/core/persistence";

const UNAVAILABLE_MESSAGE =
    "Agentchat now runs against Convex only. Sign in to access your data.";

export class UnavailablePersistenceAdapter implements PersistenceAdapter {
    private fail(): never {
        throw new Error(UNAVAILABLE_MESSAGE);
    }

    async createChat(): Promise<string> {
        this.fail();
    }

    async getChat(_id: string, _agentId: string): Promise<undefined> {
        return undefined;
    }

    async getAllChats(): Promise<[]> {
        return [];
    }

    async updateChat(): Promise<void> {
        this.fail();
    }

    async markChatViewed(
        _chatId: string,
        _timestamp: number,
        _agentId: string,
    ): Promise<void> {
        this.fail();
    }

    async deleteChat(_id: string, _agentId: string): Promise<string | null> {
        this.fail();
    }

    async createMessage(_message: unknown, _agentId: string): Promise<string> {
        this.fail();
    }

    async updateMessage(): Promise<void> {
        this.fail();
    }

    async getMessagesByChat(_chatId: string, _agentId: string): Promise<[]> {
        return [];
    }

    async deleteMessagesByChat(
        _chatId: string,
        _agentId: string,
    ): Promise<void> {
        this.fail();
    }

    async deleteMessage(): Promise<void> {
        this.fail();
    }
}

export const unavailablePersistenceAdapter =
    new UnavailablePersistenceAdapter();
