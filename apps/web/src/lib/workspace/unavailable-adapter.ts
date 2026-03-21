import type { PersistenceAdapter } from "@/lib/workspace/persistence-adapter";

const UNAVAILABLE_MESSAGE =
    "Agentchat now runs against Convex only. Sign in to access your data.";

export class UnavailablePersistenceAdapter implements PersistenceAdapter {
    private fail(): never {
        throw new Error(UNAVAILABLE_MESSAGE);
    }

    async createChat(): Promise<string> {
        this.fail();
    }

    async getChat(): Promise<undefined> {
        return undefined;
    }

    async getAllChats(): Promise<[]> {
        return [];
    }

    async updateChat(): Promise<void> {
        this.fail();
    }

    async markChatViewed(): Promise<void> {
        this.fail();
    }

    async deleteChat(): Promise<string | null> {
        this.fail();
    }

    async createMessage(): Promise<string> {
        this.fail();
    }

    async updateMessage(): Promise<void> {
        this.fail();
    }

    async getMessagesByChat(): Promise<[]> {
        return [];
    }

    async deleteMessagesByChat(): Promise<void> {
        this.fail();
    }

    async deleteMessage(): Promise<void> {
        this.fail();
    }
}

export const unavailablePersistenceAdapter =
    new UnavailablePersistenceAdapter();
