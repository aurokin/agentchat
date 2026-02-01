import type {
    StorageAdapter,
    SkillSettings as SyncSkillSettings,
    SkillSettingsUpdate,
} from "../sync";
import type { ChatSession, Message, Attachment } from "../types";
import type { Skill } from "../skills";

export type MemoryAdapterSeed = {
    chats?: ChatSession[];
    messages?: Message[];
    attachments?: Attachment[];
    skills?: Skill[];
    skillSettings?: SyncSkillSettings;
};

const defaultSkillSettings: SyncSkillSettings = {
    defaultSkillId: null,
    selectedSkillId: null,
    selectedSkillMode: "auto",
};

const findIndexById = <T extends { id: string }>(items: T[], id: string) =>
    items.findIndex((item) => item.id === id);

export function createMemoryAdapter(
    seed: MemoryAdapterSeed = {},
): StorageAdapter {
    const chats = [...(seed.chats ?? [])];
    const messages = [...(seed.messages ?? [])];
    const attachments = [...(seed.attachments ?? [])];
    const skills = [...(seed.skills ?? [])];
    let skillSettings: SyncSkillSettings = seed.skillSettings ?? {
        ...defaultSkillSettings,
    };

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
                if (messages[i].sessionId === chatId) {
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

        async saveAttachment(attachment) {
            attachments.push(attachment);
            return attachment.id;
        },
        async saveAttachments(newAttachments) {
            attachments.push(...newAttachments);
            return newAttachments.map((attachment) => attachment.id);
        },
        async getAttachment(id) {
            return attachments.find((attachment) => attachment.id === id);
        },
        async getAttachmentsByMessage(messageId) {
            return attachments.filter(
                (attachment) => attachment.messageId === messageId,
            );
        },
        async deleteAttachment(id) {
            const index = findIndexById(attachments, id);
            if (index >= 0) {
                attachments.splice(index, 1);
            }
        },
        async deleteAttachmentsByMessage(messageId) {
            for (let i = attachments.length - 1; i >= 0; i -= 1) {
                if (attachments[i].messageId === messageId) {
                    attachments.splice(i, 1);
                }
            }
        },

        async getImageStorageUsage() {
            return attachments
                .filter((attachment) => !attachment.purgedAt)
                .reduce((sum, attachment) => sum + attachment.size, 0);
        },
        async getStorageUsage() {
            const bytes = attachments
                .filter((attachment) => !attachment.purgedAt)
                .reduce((sum, attachment) => sum + attachment.size, 0);
            return {
                bytes,
                messageCount: messages.length,
                sessionCount: chats.length,
            };
        },

        async getSkills() {
            return [...skills];
        },
        async createSkill(skill) {
            skills.push(skill);
            return skill.id;
        },
        async updateSkill(skill) {
            const index = findIndexById(skills, skill.id);
            if (index >= 0) {
                skills[index] = skill;
            }
        },
        async deleteSkill(id) {
            const index = findIndexById(skills, id);
            if (index >= 0) {
                skills.splice(index, 1);
            }
        },
        async getSkillSettings() {
            return { ...skillSettings };
        },
        async upsertSkillSettings(settings: SkillSettingsUpdate) {
            skillSettings = { ...skillSettings, ...settings };
        },
    };
}
