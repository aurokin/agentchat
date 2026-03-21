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
    private messageScopedIdMap: Map<string, string> = new Map();

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

        this.cacheMessageId(message.id, convexId, chatConvexId);
        return message.id;
    }

    async updateMessage(message: Message): Promise<void> {
        const cachedChatId = this.getUniqueCachedChatIdForLocalId(
            message.sessionId,
        );
        let convexId = cachedChatId
            ? this.messageScopedIdMap.get(
                  this.getMessageLookupKey(cachedChatId, message.id),
              )
            : this.messageIdMap.get(message.id);

        if (!convexId) {
            if (!cachedChatId) {
                throw new Error(
                    `Message not found or ambiguous: ${message.id}`,
                );
            }
            const existing = (
                await this.services.messages.listByChat({
                    chatId: cachedChatId,
                })
            ).filter(
                (candidate) =>
                    (candidate.localId ?? candidate._id) === message.id,
            );
            if (existing.length === 0) {
                throw new Error(`Message not found: ${message.id}`);
            }
            if (existing.length !== 1) {
                throw new Error(
                    `Message not found or ambiguous: ${message.id}`,
                );
            }
            convexId = existing[0]?._id;
            if (!convexId) {
                throw new Error(`Message not found: ${message.id}`);
            }
            this.cacheMessageId(message.id, convexId, cachedChatId);
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
            return;
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
        return JSON.stringify([agentId ?? null, localId]);
    }

    private parseChatLookupKey(
        lookupKey: string,
    ): { agentId?: string; localId: string } | null {
        try {
            const parsed = JSON.parse(lookupKey);
            if (!Array.isArray(parsed) || parsed.length !== 2) {
                return null;
            }

            const [agentId, localId] = parsed;
            if (
                localId === undefined ||
                typeof localId !== "string" ||
                (agentId !== null && typeof agentId !== "string")
            ) {
                return null;
            }

            return {
                agentId: agentId ?? undefined,
                localId,
            };
        } catch {
            return null;
        }
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
        this.cacheMessageId(localId, msg._id, msg.chatId);

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

    private cacheMessageId(
        localId: string,
        convexId: string,
        chatConvexId: string,
    ): void {
        const scopedKey = this.getMessageLookupKey(chatConvexId, localId);
        this.messageScopedIdMap.set(scopedKey, convexId);

        const existing = this.messageIdMap.get(localId);
        if (existing && existing !== convexId) {
            this.messageIdMap.delete(localId);
            return;
        }

        this.messageIdMap.set(localId, convexId);
    }

    private getMessageLookupKey(chatConvexId: string, localId: string): string {
        return JSON.stringify([chatConvexId, localId]);
    }

    private getUniqueCachedChatIdForLocalId(localId: string): string | null {
        const matchingChatIds = new Set<string>();

        for (const [lookupKey, convexId] of this.chatIdMap.entries()) {
            const parsed = this.parseChatLookupKey(lookupKey);
            if (parsed?.localId === localId) {
                matchingChatIds.add(convexId);
            }
        }

        if (matchingChatIds.size !== 1) {
            return null;
        }

        return matchingChatIds.values().next().value ?? null;
    }
}
