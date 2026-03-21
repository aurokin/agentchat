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
    lastViewedAt?: number | null;
    createdAt: number;
    updatedAt: number;
}

export interface ConvexMessageLike {
    _id: string;
    localId?: string;
    chatId: string;
    role: Message["role"];
    kind?: Message["kind"];
    content: string;
    contextContent: string;
    reasoning?: string;
    modelId?: string;
    runMessageIndex?: number | null;
    variantId?: string | null;
    reasoningEffort?: Message["reasoningEffort"];
    createdAt: number;
}

export interface ConvexAdapterServices {
    chats: {
        create(args: { userId: string; chat: ChatSession }): Promise<string>;
        get(args: { id: string }): Promise<ConvexChatLike | null>;
        getByLocalId(args: {
            userId: string;
            agentId: string;
            localId: string;
        }): Promise<ConvexChatLike | null>;
        listByUser(args: { userId: string }): Promise<ConvexChatLike[]>;
        update(args: { id: string; chat: ChatSession }): Promise<void>;
        markViewed(args: { id: string; timestamp: number }): Promise<void>;
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
        this.chatIdMap.set(
            this.getChatLookupKey(chat.id, chat.agentId),
            convexId,
        );
        return chat.id;
    }

    async getChat(
        id: string,
        agentId?: string,
    ): Promise<ChatSession | undefined> {
        let convexId = this.chatIdMap.get(this.getChatLookupKey(id, agentId));

        if (!convexId) {
            if (!agentId) return undefined;
            const chat = await this.services.chats.getByLocalId({
                userId: this.userId,
                agentId,
                localId: id,
            });
            if (!chat) return undefined;
            convexId = chat._id;
            this.chatIdMap.set(this.getChatLookupKey(id, agentId), convexId);
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
            this.chatIdMap.set(
                this.getChatLookupKey(chat.localId ?? chat._id, chat.agentId),
                chat._id,
            );
            return this.convexChatToLocal(chat);
        });
    }

    async updateChat(chat: ChatSession): Promise<void> {
        let convexId = this.chatIdMap.get(
            this.getChatLookupKey(chat.id, chat.agentId),
        );

        if (!convexId) {
            const existing = await this.services.chats.getByLocalId({
                userId: this.userId,
                agentId: chat.agentId,
                localId: chat.id,
            });
            if (!existing) {
                throw new Error(`Chat not found: ${chat.id}`);
            }
            convexId = existing._id;
            this.chatIdMap.set(
                this.getChatLookupKey(chat.id, chat.agentId),
                convexId,
            );
        }

        await this.services.chats.update({ id: convexId, chat });
    }

    async markChatViewed(
        chatId: string,
        timestamp: number,
        agentId?: string,
    ): Promise<void> {
        if (!Number.isFinite(timestamp)) {
            return;
        }

        const convexId = await this.getOrLookupChatId(chatId, agentId);
        if (!convexId) {
            throw new Error(`Chat not found: ${chatId}`);
        }

        await this.services.chats.markViewed({ id: convexId, timestamp });
    }

    async deleteChat(id: string, agentId?: string): Promise<string | null> {
        let convexId = this.chatIdMap.get(this.getChatLookupKey(id, agentId));

        if (!convexId) {
            if (!agentId) return null;
            const existing = await this.services.chats.getByLocalId({
                userId: this.userId,
                agentId,
                localId: id,
            });
            if (!existing) return null;
            convexId = existing._id;
        }

        await this.services.chats.remove({ id: convexId });
        this.chatIdMap.delete(this.getChatLookupKey(id, agentId));
        return convexId;
    }

    async createMessage(message: Message, agentId?: string): Promise<string> {
        const chatConvexId = await this.getOrLookupChatId(
            message.sessionId,
            agentId,
        );
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

    async getMessagesByChat(
        chatId: string,
        agentId?: string,
    ): Promise<Message[]> {
        const chatConvexId = await this.getOrLookupChatId(chatId, agentId);
        if (!chatConvexId) return [];

        const messages = await this.services.messages.listByChat({
            chatId: chatConvexId,
        });

        return messages.map((msg) => this.convexMessageToLocal(msg, chatId));
    }

    async deleteMessagesByChat(
        chatId: string,
        agentId?: string,
    ): Promise<void> {
        const chatConvexId = await this.getOrLookupChatId(chatId, agentId);
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

    protected async getOrLookupChatId(
        localId: string,
        agentId?: string,
    ): Promise<string | null> {
        const cached = this.chatIdMap.get(
            this.getChatLookupKey(localId, agentId),
        );
        if (cached) return cached;

        if (!agentId) {
            return null;
        }

        const chat = await this.services.chats.getByLocalId({
            userId: this.userId,
            agentId,
            localId,
        });

        if (chat) {
            this.chatIdMap.set(
                this.getChatLookupKey(localId, agentId),
                chat._id,
            );
            return chat._id;
        }

        return null;
    }

    private getChatLookupKey(localId: string, agentId?: string): string {
        return agentId ? `${agentId}:${localId}` : localId;
    }

    protected convexChatToLocal(chat: ConvexChatLike): ChatSession {
        return {
            id: chat.localId ?? chat._id,
            agentId: chat.agentId,
            title: chat.title,
            modelId: chat.modelId,
            variantId: chat.variantId ?? null,
            lastViewedAt: chat.lastViewedAt ?? null,
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
            kind: msg.kind,
            content: msg.content,
            contextContent: msg.contextContent,
            reasoning: msg.reasoning,
            modelId: msg.modelId,
            runMessageIndex: msg.runMessageIndex ?? null,
            variantId: msg.variantId ?? null,
            reasoningEffort: msg.reasoningEffort,
            createdAt: msg.createdAt,
        };
    }
}
