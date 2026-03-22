import type { PersistenceAdapter } from "../persistence";
import type { ChatSession, Message } from "../types";

export type MemoryAdapterSeed = {
    chats?: ChatSession[];
    messages?: Message[];
};

const findIndexById = <T extends { id: string }>(items: T[], id: string) =>
    items.findIndex((item) => item.id === id);

export function createMemoryAdapter(
    seed: MemoryAdapterSeed = {},
): PersistenceAdapter {
    const chats = [...(seed.chats ?? [])];
    const messages = [...(seed.messages ?? [])];

    return {
        async createChat(chat) {
            chats.push(chat);
            return chat.id;
        },
        async getChat(id, agentId) {
            return chats.find(
                (chat) => chat.id === id && chat.agentId === agentId,
            );
        },
        async getAllChats() {
            return [...chats];
        },
        async updateChat(chat) {
            const index = findIndexById(chats, chat.id);
            if (index >= 0) {
                chats[index] = chat;
            }
        },
        async markChatViewed(chatId, timestamp, agentId) {
            const index = chats.findIndex(
                (chat) => chat.id === chatId && chat.agentId === agentId,
            );
            if (index >= 0) {
                const existingChat = chats[index];
                if (!existingChat) {
                    return;
                }
                chats[index] = {
                    ...existingChat,
                    lastViewedAt: timestamp,
                };
            }
        },
        async deleteChat(id, agentId) {
            const index = chats.findIndex(
                (chat) => chat.id === id && chat.agentId === agentId,
            );
            if (index >= 0) {
                chats.splice(index, 1);
            }
            return id;
        },

        async createMessage(message, agentId) {
            const chat = chats.find(
                (candidate) =>
                    candidate.id === message.sessionId &&
                    candidate.agentId === agentId,
            );
            if (!chat) {
                throw new Error(`Chat not found: ${message.sessionId}`);
            }
            messages.push(message);
            return message.id;
        },
        async updateMessage(message) {
            const index = findIndexById(messages, message.id);
            if (index >= 0) {
                messages[index] = message;
            }
        },
        async getMessagesByChat(chatId, agentId) {
            const chat = chats.find(
                (candidate) =>
                    candidate.id === chatId && candidate.agentId === agentId,
            );
            if (!chat) {
                return [];
            }
            return messages.filter((message) => message.sessionId === chatId);
        },
        async deleteMessagesByChat(chatId, agentId) {
            const chat = chats.find(
                (candidate) =>
                    candidate.id === chatId && candidate.agentId === agentId,
            );
            if (!chat) {
                return;
            }
            for (let i = messages.length - 1; i >= 0; i -= 1) {
                const message = messages[i];
                if (message?.sessionId === chatId) {
                    messages.splice(i, 1);
                }
            }
        },
        async deleteMessage(id) {
            const index = findIndexById(messages, id);
            if (index >= 0) {
                messages.splice(index, 1);
            }
        },
    };
}
