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
        async getChat(id) {
            return chats.find((chat) => chat.id === id);
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
        async markChatViewed(chatId, timestamp) {
            const index = findIndexById(chats, chatId);
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
        async deleteChat(id) {
            const index = findIndexById(chats, id);
            if (index >= 0) {
                chats.splice(index, 1);
            }
        },

        async createMessage(message) {
            messages.push(message);
            return message.id;
        },
        async updateMessage(message) {
            const index = findIndexById(messages, message.id);
            if (index >= 0) {
                messages[index] = message;
            }
        },
        async getMessagesByChat(chatId) {
            return messages.filter((message) => message.sessionId === chatId);
        },
        async deleteMessagesByChat(chatId) {
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
