import type { PersistenceAdapter } from "@shared/core/persistence";
import { api } from "@convex/_generated/api";
import type {
    ConvexAPI,
    ConvexId,
    ConvexClientInterface,
} from "@/lib/workspace/convex-types";
import {
    ConvexAdapterBase,
    type ConvexAdapterServices,
} from "@shared/core/persistence/convex-adapter-base";

const convexApi = api as unknown as ConvexAPI;

const CHAT_PAGE_SIZE = 250;
const MESSAGE_PAGE_SIZE = 200;

async function collectAllPages<T>(
    fetchPage: (cursor: string | null) => Promise<{
        page: T[];
        isDone: boolean;
        continueCursor: string;
    }>,
): Promise<T[]> {
    const results: T[] = [];
    let cursor: string | null = null;

    // Prevent accidental infinite loops if something goes wrong with cursors.
    for (let i = 0; i < 10_000; i++) {
        const page = await fetchPage(cursor);
        results.push(...(page.page ?? []));

        if (page.isDone) return results;

        if (page.continueCursor === cursor) {
            throw new Error("Pagination cursor did not advance");
        }
        cursor = page.continueCursor;
    }

    throw new Error("Pagination exceeded maximum number of pages");
}

function createServices(client: ConvexClientInterface): ConvexAdapterServices {
    return {
        chats: {
            create: async ({ userId, chat }) =>
                (await client.mutation(convexApi.chats.create, {
                    userId: userId as ConvexId<"users">,
                    localId: chat.id,
                    agentId: chat.agentId,
                    title: chat.title,
                    modelId: chat.modelId,
                    variantId: chat.variantId ?? null,
                    createdAt: chat.createdAt,
                    updatedAt: chat.updatedAt,
                })) as string,
            get: async ({ id }) =>
                (await client.query(convexApi.chats.get, {
                    id: id as ConvexId<"chats">,
                })) as any,
            getByLocalId: async ({ userId, localId }) =>
                (await client.query(convexApi.chats.getByLocalId, {
                    userId: userId as ConvexId<"users">,
                    localId,
                })) as any,
            listByUser: async ({ userId }) =>
                await collectAllPages(async (cursor) => {
                    return (await client.query(
                        convexApi.chats.listByUserPaginated,
                        {
                            userId: userId as ConvexId<"users">,
                            paginationOpts: {
                                numItems: CHAT_PAGE_SIZE,
                                cursor,
                            },
                        },
                    )) as any;
                }),
            update: async ({ id, chat }) => {
                await client.mutation(convexApi.chats.update, {
                    id: id as ConvexId<"chats">,
                    title: chat.title,
                    modelId: chat.modelId,
                    variantId: chat.variantId ?? null,
                });
            },
            remove: async ({ id }) => {
                await client.mutation(convexApi.chats.remove, {
                    id: id as ConvexId<"chats">,
                });
            },
        },
        messages: {
            create: async ({ userId, chatId, message }) =>
                (await client.mutation(convexApi.messages.create, {
                    userId: userId as ConvexId<"users">,
                    chatId: chatId as ConvexId<"chats">,
                    localId: message.id,
                    role: message.role,
                    kind: message.kind,
                    content: message.content,
                    contextContent: message.contextContent,
                    thinking: message.thinking,
                    runMessageIndex: message.runMessageIndex ?? null,
                    modelId: message.modelId,
                    variantId: message.variantId ?? null,
                    thinkingLevel: message.thinkingLevel,
                    createdAt: message.createdAt,
                })) as string,
            getByLocalId: async ({ userId, localId }) =>
                (await client.query(convexApi.messages.getByLocalId, {
                    userId: userId as ConvexId<"users">,
                    localId,
                })) as any,
            listByChat: async ({ chatId }) =>
                await collectAllPages(async (cursor) => {
                    return (await client.query(
                        convexApi.messages.listByChatPaginated,
                        {
                            chatId: chatId as ConvexId<"chats">,
                            paginationOpts: {
                                numItems: MESSAGE_PAGE_SIZE,
                                cursor,
                            },
                        },
                    )) as any;
                }),
            update: async ({ id, message }) => {
                await client.mutation(convexApi.messages.update, {
                    id: id as ConvexId<"messages">,
                    content: message.content,
                    contextContent: message.contextContent,
                    thinking: message.thinking,
                    runMessageIndex: message.runMessageIndex ?? null,
                    variantId: message.variantId ?? null,
                });
            },
            remove: async ({ id }) => {
                await client.mutation(convexApi.messages.remove, {
                    id: id as ConvexId<"messages">,
                });
            },
            deleteByChat: async ({ chatId }) => {
                await client.mutation(convexApi.messages.deleteByChat, {
                    chatId: chatId as ConvexId<"chats">,
                });
            },
        },
    };
}

export class ConvexPersistenceAdapter
    extends ConvexAdapterBase
    implements PersistenceAdapter
{
    constructor(client: ConvexClientInterface, userId: ConvexId<"users">) {
        super({
            client,
            userId,
            services: createServices(client),
        });
    }
}
