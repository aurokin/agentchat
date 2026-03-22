import { describe, expect, mock, test } from "bun:test";

import { ConvexAdapterBase } from "../convex-adapter-base";
import type {
    ConvexAdapterServices,
    ConvexClientLike,
} from "../convex-adapter-base";
import type { ChatSession, Message } from "../../types";

class TestConvexAdapter extends ConvexAdapterBase {}

function createChat(params: {
    id: string;
    convexId: string;
    agentId: string;
}): ChatSession & { convexId: string } {
    return {
        id: params.id,
        convexId: params.convexId,
        agentId: params.agentId,
        title: "Chat",
        modelId: "gpt-5.4",
        variantId: null,
        createdAt: 1,
        updatedAt: 1,
    };
}

function createMessage(params: {
    id: string;
    sessionId: string;
    content: string;
}): Message {
    return {
        id: params.id,
        sessionId: params.sessionId,
        role: "assistant",
        kind: "assistant_message",
        content: params.content,
        contextContent: params.content,
        variantId: null,
        createdAt: 1,
    };
}

function createAdapter(params: {
    chats: Array<ReturnType<typeof createChat>>;
    messagesByChatId: Record<string, Array<Message & { convexId?: string }>>;
    update?: ReturnType<typeof mock>;
    remove?: ReturnType<typeof mock>;
}) {
    const update = params.update ?? mock(async () => undefined);
    const remove = params.remove ?? mock(async () => undefined);
    const services: ConvexAdapterServices = {
        chats: {
            create: async () => "unused",
            get: async ({ id }) => {
                const chat = params.chats.find(
                    (candidate) => candidate.convexId === id,
                );
                return chat
                    ? {
                          _id: chat.convexId,
                          localId: chat.id,
                          agentId: chat.agentId,
                          title: chat.title,
                          modelId: chat.modelId,
                          variantId: chat.variantId,
                          createdAt: chat.createdAt,
                          updatedAt: chat.updatedAt,
                      }
                    : null;
            },
            getByLocalId: async ({ agentId, localId }) => {
                const matches = params.chats.filter(
                    (chat) => chat.agentId === agentId && chat.id === localId,
                );
                if (matches.length !== 1) {
                    return null;
                }
                const chat = matches[0]!;
                return {
                    _id: chat.convexId,
                    localId: chat.id,
                    agentId: chat.agentId,
                    title: chat.title,
                    modelId: chat.modelId,
                    variantId: chat.variantId,
                    createdAt: chat.createdAt,
                    updatedAt: chat.updatedAt,
                };
            },
            listByUser: async () =>
                params.chats.map((chat) => ({
                    _id: chat.convexId,
                    localId: chat.id,
                    agentId: chat.agentId,
                    title: chat.title,
                    modelId: chat.modelId,
                    variantId: chat.variantId,
                    createdAt: chat.createdAt,
                    updatedAt: chat.updatedAt,
                })),
            update: async () => undefined,
            markViewed: async () => undefined,
            remove: async () => undefined,
        },
        messages: {
            create: async () => "unused",
            getByLocalId: async () => null,
            listByChat: async ({ chatId }) =>
                (params.messagesByChatId[chatId] ?? []).map((message) => ({
                    _id: message.convexId ?? `${chatId}:${message.id}`,
                    localId: message.id,
                    chatId,
                    role: message.role,
                    kind: message.kind,
                    content: message.content,
                    contextContent: message.contextContent,
                    createdAt: message.createdAt,
                })),
            update,
            remove,
            deleteByChat: async () => undefined,
        },
    };

    const client: ConvexClientLike = {
        mutation: async () => {
            throw new Error("unused");
        },
        query: async () => {
            throw new Error("unused");
        },
    };

    return {
        adapter: new TestConvexAdapter({
            client,
            userId: "users:test",
            services,
        }),
        update,
        remove,
    };
}

describe("ConvexAdapterBase", () => {
    test("fails safely when updateMessage cannot disambiguate duplicate chat local ids across agents", async () => {
        const { adapter, update } = createAdapter({
            chats: [
                createChat({
                    id: "chat-1",
                    convexId: "chats:agent-a",
                    agentId: "agent-a",
                }),
                createChat({
                    id: "chat-1",
                    convexId: "chats:agent-b",
                    agentId: "agent-b",
                }),
            ],
            messagesByChatId: {
                "chats:agent-a": [
                    createMessage({
                        id: "message-1",
                        sessionId: "chat-1",
                        content: "A",
                    }),
                ],
                "chats:agent-b": [
                    createMessage({
                        id: "message-1",
                        sessionId: "chat-1",
                        content: "B",
                    }),
                ],
            },
        });

        await adapter.getAllChats();
        await adapter.getMessagesByChat("chat-1", "agent-a");
        await adapter.getMessagesByChat("chat-1", "agent-b");

        await expect(
            adapter.updateMessage(
                createMessage({
                    id: "message-1",
                    sessionId: "chat-1",
                    content: "updated",
                }),
            ),
        ).rejects.toThrow("Message not found or ambiguous");

        expect(update).not.toHaveBeenCalled();
    });

    test("deleteMessage no-ops when a message local id became ambiguous across chats", async () => {
        const { adapter, remove } = createAdapter({
            chats: [
                createChat({
                    id: "chat-1",
                    convexId: "chats:agent-a",
                    agentId: "agent-a",
                }),
                createChat({
                    id: "chat-2",
                    convexId: "chats:agent-b",
                    agentId: "agent-b",
                }),
            ],
            messagesByChatId: {
                "chats:agent-a": [
                    createMessage({
                        id: "message-1",
                        sessionId: "chat-1",
                        content: "A",
                    }),
                ],
                "chats:agent-b": [
                    createMessage({
                        id: "message-1",
                        sessionId: "chat-2",
                        content: "B",
                    }),
                ],
            },
        });

        await adapter.getAllChats();
        await adapter.getMessagesByChat("chat-1", "agent-a");
        await adapter.getMessagesByChat("chat-2", "agent-b");
        await adapter.deleteMessage("message-1");

        expect(remove).not.toHaveBeenCalled();
    });

    test("updateMessage does not suffix-match cached chat ids containing colons", async () => {
        const { adapter, update } = createAdapter({
            chats: [
                createChat({
                    id: "chat-1",
                    convexId: "chats:plain",
                    agentId: "agent-a",
                }),
                createChat({
                    id: "scoped:chat-1",
                    convexId: "chats:colon",
                    agentId: "agent-b",
                }),
            ],
            messagesByChatId: {
                "chats:plain": [
                    createMessage({
                        id: "message-1",
                        sessionId: "chat-1",
                        content: "plain",
                    }),
                ],
                "chats:colon": [
                    createMessage({
                        id: "message-1",
                        sessionId: "scoped:chat-1",
                        content: "colon",
                    }),
                ],
            },
        });

        await adapter.getAllChats();
        await adapter.getMessagesByChat("chat-1", "agent-a");
        await adapter.getMessagesByChat("scoped:chat-1", "agent-b");

        await expect(
            adapter.updateMessage(
                createMessage({
                    id: "message-1",
                    sessionId: "chat-1",
                    content: "updated",
                }),
            ),
        ).resolves.toBeUndefined();

        expect(update).toHaveBeenCalledWith({
            id: "chats:plain:message-1",
            message: createMessage({
                id: "message-1",
                sessionId: "chat-1",
                content: "updated",
            }),
        });
    });

    test("message-scoped cache keys do not collide when chat ids and message ids contain colons", async () => {
        const { adapter, update } = createAdapter({
            chats: [
                createChat({
                    id: "chat-a",
                    convexId: "chats:one",
                    agentId: "agent-a",
                }),
                createChat({
                    id: "chat-b",
                    convexId: "chats:one:message",
                    agentId: "agent-b",
                }),
            ],
            messagesByChatId: {
                "chats:one": [
                    {
                        ...createMessage({
                            id: "message:1",
                            sessionId: "chat-a",
                            content: "first",
                        }),
                        convexId: "messages:first",
                    },
                ],
                "chats:one:message": [
                    {
                        ...createMessage({
                            id: "1",
                            sessionId: "chat-b",
                            content: "second",
                        }),
                        convexId: "messages:second",
                    },
                ],
            },
        });

        await adapter.getAllChats();
        await adapter.getMessagesByChat("chat-a", "agent-a");
        await adapter.getMessagesByChat("chat-b", "agent-b");

        await expect(
            adapter.updateMessage(
                createMessage({
                    id: "message:1",
                    sessionId: "chat-a",
                    content: "updated",
                }),
            ),
        ).resolves.toBeUndefined();

        expect(update).toHaveBeenCalledTimes(1);
        expect(update).toHaveBeenCalledWith({
            id: "messages:first",
            message: createMessage({
                id: "message:1",
                sessionId: "chat-a",
                content: "updated",
            }),
        });
    });
});
