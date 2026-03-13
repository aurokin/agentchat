import type { ChatSession, Message } from "../types";
import type { PersistenceAdapter } from "./index";

export interface ConvexFunctionReference<
    Type extends "mutation" | "query" | "action",
    _Args = unknown,
    _Result = unknown,
> {
    _type: Type;
    _args: _Args;
    _returnType: _Result;
}

export interface ConvexClientLike {
    mutation<Args, Result>(
        fn: ConvexFunctionReference<"mutation", Args, Result>,
        args: Args,
    ): Promise<Result>;
    query<Args, Result>(
        fn: ConvexFunctionReference<"query", Args, Result>,
        args: Args,
    ): Promise<Result>;
}

export interface ConvexChatLike {
    _id: string;
    localId?: string;
    agentId: string;
    title: string;
    modelId: string;
    variantId?: string | null;
    thinking: ChatSession["thinking"];
    createdAt: number;
    updatedAt: number;
}

export interface ConvexMessageLike {
    _id: string;
    localId?: string;
    chatId: string;
    role: Message["role"];
    content: string;
    contextContent: string;
    thinking?: string;
    modelId?: string;
    variantId?: string | null;
    thinkingLevel?: Message["thinkingLevel"];
    createdAt: number;
}

export interface ConvexAdapterServices {
    chats: {
        create(args: { userId: string; chat: ChatSession }): Promise<string>;
        get(args: { id: string }): Promise<ConvexChatLike | null>;
        getByLocalId(args: {
            userId: string;
            localId: string;
        }): Promise<ConvexChatLike | null>;
        listByUser(args: { userId: string }): Promise<ConvexChatLike[]>;
        update(args: { id: string; chat: ChatSession }): Promise<void>;
        remove(args: { id: string }): Promise<void>;
    };
    messages: {
        create(args: {
            userId: string;
            chatId: string;
            message: Message;
        }): Promise<string>;
        getByLocalId(args: {
            userId: string;
            localId: string;
        }): Promise<ConvexMessageLike | null>;
        listByChat(args: { chatId: string }): Promise<ConvexMessageLike[]>;
        update(args: { id: string; message: Message }): Promise<void>;
        remove(args: { id: string }): Promise<void>;
        deleteByChat(args: { chatId: string }): Promise<void>;
    };
}

export abstract class ConvexAdapterBase implements PersistenceAdapter {
    protected readonly client: ConvexClientLike;
    protected readonly userId: string;
    private readonly services: ConvexAdapterServices;

    private chatIdMap: Map<string, string> = new Map();
    private messageIdMap: Map<string, string> = new Map();

    constructor(params: {
        client: ConvexClientLike;
        userId: string;
        services: ConvexAdapterServices;
    }) {
        this.client = params.client;
        this.userId = params.userId;
        this.services = params.services;
    }

    async createChat(chat: ChatSession): Promise<string> {
        const convexId = await this.services.chats.create({
            userId: this.userId,
            chat,
        });
        this.chatIdMap.set(chat.id, convexId);
        return chat.id;
    }

    async getChat(id: string): Promise<ChatSession | undefined> {
        let convexId = this.chatIdMap.get(id);

        if (!convexId) {
            const chat = await this.services.chats.getByLocalId({
                userId: this.userId,
                localId: id,
            });
            if (!chat) return undefined;
            convexId = chat._id;
            this.chatIdMap.set(id, convexId);
        }

        const chat = await this.services.chats.get({ id: convexId });
        if (!chat) return undefined;

        return this.convexChatToLocal(chat);
    }

    async getAllChats(): Promise<ChatSession[]> {
        const chats = await this.services.chats.listByUser({
            userId: this.userId,
        });

        return chats.map((chat) => {
            this.chatIdMap.set(chat.localId ?? chat._id, chat._id);
            return this.convexChatToLocal(chat);
        });
    }

    async updateChat(chat: ChatSession): Promise<void> {
        let convexId = this.chatIdMap.get(chat.id);

        if (!convexId) {
            const existing = await this.services.chats.getByLocalId({
                userId: this.userId,
                localId: chat.id,
            });
            if (!existing) {
                throw new Error(`Chat not found: ${chat.id}`);
            }
            convexId = existing._id;
            this.chatIdMap.set(chat.id, convexId);
        }

        await this.services.chats.update({ id: convexId, chat });
    }

    async deleteChat(id: string): Promise<void> {
        let convexId = this.chatIdMap.get(id);

        if (!convexId) {
            const existing = await this.services.chats.getByLocalId({
                userId: this.userId,
                localId: id,
            });
            if (!existing) return;
            convexId = existing._id;
        }

        await this.services.chats.remove({ id: convexId });
        this.chatIdMap.delete(id);
    }

    async createMessage(message: Message): Promise<string> {
        const chatConvexId = await this.getOrLookupChatId(message.sessionId);
        if (!chatConvexId) {
            throw new Error(`Chat not found: ${message.sessionId}`);
        }

        const convexId = await this.services.messages.create({
            userId: this.userId,
            chatId: chatConvexId,
            message,
        });

        this.messageIdMap.set(message.id, convexId);
        return message.id;
    }

    async updateMessage(message: Message): Promise<void> {
        let convexId = this.messageIdMap.get(message.id);

        if (!convexId) {
            const existing = await this.services.messages.getByLocalId({
                userId: this.userId,
                localId: message.id,
            });
            if (!existing) {
                throw new Error(`Message not found: ${message.id}`);
            }
            convexId = existing._id;
            this.messageIdMap.set(message.id, convexId);
        }

        await this.services.messages.update({ id: convexId, message });
    }

    async getMessagesByChat(chatId: string): Promise<Message[]> {
        const chatConvexId = await this.getOrLookupChatId(chatId);
        if (!chatConvexId) return [];

        const messages = await this.services.messages.listByChat({
            chatId: chatConvexId,
        });

        return messages.map((msg) => this.convexMessageToLocal(msg, chatId));
    }

    async deleteMessagesByChat(chatId: string): Promise<void> {
        const chatConvexId = await this.getOrLookupChatId(chatId);
        if (!chatConvexId) return;

        await this.services.messages.deleteByChat({ chatId: chatConvexId });
    }

    async deleteMessage(id: string): Promise<void> {
        let convexId = this.messageIdMap.get(id);

        if (!convexId) {
            const existing = await this.services.messages.getByLocalId({
                userId: this.userId,
                localId: id,
            });
            if (!existing) return;
            convexId = existing._id;
        }

        await this.services.messages.remove({ id: convexId });
        this.messageIdMap.delete(id);
    }

    protected async getOrLookupChatId(localId: string): Promise<string | null> {
        const cached = this.chatIdMap.get(localId);
        if (cached) return cached;

        const chat = await this.services.chats.getByLocalId({
            userId: this.userId,
            localId,
        });

        if (chat) {
            this.chatIdMap.set(localId, chat._id);
            return chat._id;
        }

        return null;
    }

    protected convexChatToLocal(chat: ConvexChatLike): ChatSession {
        return {
            id: chat.localId ?? chat._id,
            agentId: chat.agentId,
            title: chat.title,
            modelId: chat.modelId,
            variantId: chat.variantId ?? null,
            thinking: chat.thinking,
            createdAt: chat.createdAt,
            updatedAt: chat.updatedAt,
        };
    }

    protected convexMessageToLocal(
        msg: ConvexMessageLike,
        chatLocalId: string,
    ): Message {
        const localId = msg.localId ?? msg._id;
        this.messageIdMap.set(localId, msg._id);

        return {
            id: localId,
            sessionId: chatLocalId,
            role: msg.role,
            content: msg.content,
            contextContent: msg.contextContent,
            thinking: msg.thinking,
            modelId: msg.modelId,
            variantId: msg.variantId ?? null,
            thinkingLevel: msg.thinkingLevel,
            createdAt: msg.createdAt,
        };
    }
}
