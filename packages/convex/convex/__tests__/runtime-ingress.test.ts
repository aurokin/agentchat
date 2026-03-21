import { describe, expect, mock, test } from "bun:test";

import {
    chatExistsByLocalId,
    listAllChatLocalIds,
    messageDelta,
    readRuntimeBinding,
    runCompleted,
    runStarted,
    runtimeBinding,
} from "../runtimeIngress";

type HandlerExport = {
    _handler: (ctx: unknown, args: unknown) => Promise<unknown>;
};

function runHandler(handler: HandlerExport, ctx: unknown, args: unknown) {
    return handler._handler(ctx, args);
}

describe("runtime ingress", () => {
    test("runtimeBinding no-ops when the conversation no longer exists", async () => {
        const insert = mock(async () => undefined);
        const patch = mock(async () => undefined);
        const unique = mock(async () => null);
        const collect = mock(async () => []);
        const withIndex = mock((indexName: string) =>
            indexName === "by_userId_and_agentId_and_localId" ||
            indexName === "by_user"
                ? { collect }
                : { unique },
        );
        const query = mock(() => ({ withIndex }));
        const ctx = {
            db: {
                query,
                insert,
                patch,
            },
        };

        await expect(
            runHandler(runtimeBinding as unknown as HandlerExport, ctx, {
                userId: "users:test",
                agentId: "agent-1",
                conversationLocalId: "chat:missing",
                chatId: "chats:missing",
                provider: "codex",
                status: "active",
                providerThreadId: null,
                providerResumeToken: null,
                activeRunId: "run:test",
                lastError: null,
                lastEventAt: 123,
                expiresAt: null,
                updatedAt: 123,
            }),
        ).resolves.toBeNull();

        expect(query).toHaveBeenCalledWith("chats");
        expect(unique).not.toHaveBeenCalled();
        expect(collect).toHaveBeenCalledTimes(2);
        expect(insert).not.toHaveBeenCalled();
        expect(patch).not.toHaveBeenCalled();
    });

    test("preserves existing workspace metadata when later binding writes omit it", async () => {
        const insert = mock(async () => undefined);
        const patch = mock(async () => undefined);
        const chatCollect = mock(async () => [
            {
                _id: "chats:1",
                updatedAt: 100,
                createdAt: 100,
            },
        ]);
        const bindingUnique = mock(async () => ({
            _id: "runtimeBindings:1",
            chatId: "chats:1",
            userId: "users:test",
            provider: "codex",
            status: "active",
            providerThreadId: "thread-1",
            providerResumeToken: null,
            activeRunId: "run:test",
            lastError: null,
            lastEventAt: 100,
            expiresAt: null,
            workspaceMode: "copy-on-conversation",
            workspaceRootPath: "/repos/agent-a",
            workspaceCwd: "/sandboxes/agent-a/user/chat",
            updatedAt: 100,
        }));
        const query = (table: string) => {
            if (table === "chats") {
                return {
                    withIndex: mock((indexName: string) => ({
                        collect: chatCollect,
                        unique:
                            indexName === "by_userId_and_agentId_and_localId"
                                ? undefined
                                : bindingUnique,
                    })),
                };
            }

            return {
                withIndex: mock(() => ({ unique: bindingUnique })),
            };
        };
        const ctx = {
            db: {
                query,
                insert,
                patch,
            },
        };

        await expect(
            runHandler(runtimeBinding as unknown as HandlerExport, ctx, {
                userId: "users:test",
                agentId: "agent-1",
                conversationLocalId: "chat:1",
                chatId: "chats:1",
                provider: "codex",
                status: "idle",
                providerThreadId: "thread-1",
                providerResumeToken: null,
                activeRunId: null,
                lastError: null,
                lastEventAt: 123,
                expiresAt: null,
                updatedAt: 123,
            }),
        ).resolves.toBeNull();

        expect(insert).not.toHaveBeenCalled();
        expect(patch).toHaveBeenCalledWith("runtimeBindings:1", {
            chatId: "chats:1",
            userId: "users:test",
            provider: "codex",
            status: "idle",
            providerThreadId: "thread-1",
            providerResumeToken: null,
            activeRunId: null,
            lastError: null,
            lastEventAt: 123,
            expiresAt: null,
            workspaceMode: "copy-on-conversation",
            workspaceRootPath: "/repos/agent-a",
            workspaceCwd: "/sandboxes/agent-a/user/chat",
            updatedAt: 123,
        });
    });

    test("returns workspace metadata from readRuntimeBinding", async () => {
        const chatCollect = mock(async () => [
            {
                _id: "chats:1",
                updatedAt: 100,
                createdAt: 100,
            },
        ]);
        const bindingUnique = mock(async () => ({
            provider: "codex",
            status: "idle",
            providerThreadId: "thread-1",
            providerResumeToken: null,
            activeRunId: null,
            lastError: null,
            lastEventAt: 123,
            expiresAt: null,
            workspaceMode: "copy-on-conversation",
            workspaceRootPath: "/repos/agent-a",
            workspaceCwd: "/sandboxes/agent-a/user/chat",
            updatedAt: 456,
        }));
        const query = (table: string) => {
            if (table === "chats") {
                return {
                    withIndex: mock(() => ({
                        collect: chatCollect,
                    })),
                };
            }

            return {
                withIndex: mock(() => ({
                    unique: bindingUnique,
                })),
            };
        };
        const ctx = {
            db: {
                query,
            },
        };

        await expect(
            runHandler(readRuntimeBinding as unknown as HandlerExport, ctx, {
                userId: "users:test",
                agentId: "agent-1",
                conversationLocalId: "chat:1",
            }),
        ).resolves.toEqual({
            chatId: "chats:1",
            binding: {
                provider: "codex",
                status: "idle",
                providerThreadId: "thread-1",
                providerResumeToken: null,
                activeRunId: null,
                lastError: null,
                lastEventAt: 123,
                expiresAt: null,
                workspaceMode: "copy-on-conversation",
                workspaceRootPath: "/repos/agent-a",
                workspaceCwd: "/sandboxes/agent-a/user/chat",
                updatedAt: 456,
            },
        });
    });

    test("returns the chat id even when no runtime binding exists yet", async () => {
        const chatCollect = mock(async () => [
            {
                _id: "chats:1",
                updatedAt: 100,
                createdAt: 100,
            },
        ]);
        const bindingUnique = mock(async () => null);
        const query = (table: string) => {
            if (table === "chats") {
                return {
                    withIndex: mock(() => ({
                        collect: chatCollect,
                    })),
                };
            }

            return {
                withIndex: mock(() => ({
                    unique: bindingUnique,
                })),
            };
        };
        const ctx = {
            db: {
                query,
            },
        };

        await expect(
            runHandler(readRuntimeBinding as unknown as HandlerExport, ctx, {
                userId: "users:test",
                agentId: "agent-1",
                conversationLocalId: "chat:1",
            }),
        ).resolves.toEqual({
            chatId: "chats:1",
            binding: null,
        });
    });

    test("returns paginated chat local ids without materializing the full table", async () => {
        const paginate = mock(async () => ({
            page: [
                {
                    _id: "chats:1",
                    agentId: "agent-1",
                    userId: "users:test",
                    localId: "chat-1",
                },
                {
                    _id: "chats:2",
                    agentId: "agent-2",
                    userId: "users:test-2",
                    localId: null,
                },
            ],
            continueCursor: "cursor-2",
            isDone: false,
        }));
        const query = mock(() => ({ paginate }));
        const ctx = {
            db: {
                query,
            },
        };

        await expect(
            runHandler(listAllChatLocalIds as unknown as HandlerExport, ctx, {
                cursor: null,
            }),
        ).resolves.toEqual({
            entries: [
                {
                    agentId: "agent-1",
                    userId: "users:test",
                    localId: "chat-1",
                },
                {
                    agentId: "agent-2",
                    userId: "users:test-2",
                    localId: "chats:2",
                },
            ],
            continueCursor: "cursor-2",
            isDone: false,
        });

        expect(query).toHaveBeenCalledWith("chats");
        expect(paginate).toHaveBeenCalledWith({
            numItems: 1_000,
            cursor: null,
        });
    });

    test("checks chat existence against both agentId and localId", async () => {
        const collect = mock(async () => [
            {
                _id: "chats:1",
                agentId: "agent-a",
                userId: "users:test",
                localId: "chat-1",
            },
            {
                _id: "chats:2",
                agentId: "agent-b",
                userId: "users:test",
                localId: "chat-1",
            },
        ]);
        const withIndex = mock(() => ({ collect }));
        const query = mock(() => ({ withIndex }));
        const ctx = {
            db: {
                query,
            },
        };

        await expect(
            runHandler(chatExistsByLocalId as unknown as HandlerExport, ctx, {
                userId: "users:test",
                agentId: "agent-b",
                localId: "chat-1",
            }),
        ).resolves.toBe(true);

        await expect(
            runHandler(chatExistsByLocalId as unknown as HandlerExport, ctx, {
                userId: "users:test",
                agentId: "agent-c",
                localId: "chat-1",
            }),
        ).resolves.toBe(false);
    });

    test("checks chat existence against _id fallback for legacy chats", async () => {
        const byLocalIdCollect = mock(async () => []);
        const byUserCollect = mock(async () => [
            {
                _id: "legacy-chat",
                agentId: "agent-a",
                userId: "users:test",
                localId: undefined,
            },
        ]);
        const query = mock((table: string) => {
            if (table !== "chats") {
                throw new Error(`Unexpected table ${table}`);
            }
            return {
                withIndex: mock((indexName: string) => ({
                    collect:
                        indexName === "by_local_id"
                            ? byLocalIdCollect
                            : byUserCollect,
                })),
            };
        });
        const ctx = {
            db: {
                query,
            },
        };

        await expect(
            runHandler(chatExistsByLocalId as unknown as HandlerExport, ctx, {
                userId: "users:test",
                agentId: "agent-a",
                localId: "legacy-chat",
            }),
        ).resolves.toBe(true);
    });

    test("readRuntimeBinding resolves the matching agent when chats share a localId", async () => {
        const chatCollect = mock(async () => [
            {
                _id: "chats:agent-b",
                updatedAt: 100,
                createdAt: 100,
            },
        ]);
        const bindingUnique = mock(async () => ({
            provider: "codex",
            status: "idle",
            providerThreadId: "thread-b",
            providerResumeToken: null,
            activeRunId: null,
            lastError: null,
            lastEventAt: 123,
            expiresAt: null,
            workspaceMode: "copy-on-conversation",
            workspaceRootPath: "/repos/agent-b",
            workspaceCwd: "/sandboxes/agent-b/user/chat-1",
            updatedAt: 456,
        }));
        const query = (table: string) => {
            if (table === "chats") {
                return {
                    withIndex: mock(() => ({
                        collect: chatCollect,
                    })),
                };
            }

            return {
                withIndex: mock(() => ({
                    unique: bindingUnique,
                })),
            };
        };
        const ctx = {
            db: {
                query,
            },
        };

        await expect(
            runHandler(readRuntimeBinding as unknown as HandlerExport, ctx, {
                userId: "users:test",
                agentId: "agent-b",
                conversationLocalId: "chat-1",
            }),
        ).resolves.toMatchObject({
            chatId: "chats:agent-b",
            binding: {
                providerThreadId: "thread-b",
                workspaceRootPath: "/repos/agent-b",
            },
        });
    });

    test("runtimeBinding updates the matching agent when chats share a localId", async () => {
        const insert = mock(async () => undefined);
        const patch = mock(async () => undefined);
        const chatCollect = mock(async () => [
            {
                _id: "chats:agent-b",
                updatedAt: 100,
                createdAt: 100,
            },
        ]);
        const bindingUnique = mock(async () => ({
            _id: "runtimeBindings:agent-b",
            chatId: "chats:agent-b",
            userId: "users:test",
            provider: "codex",
            status: "idle",
            providerThreadId: "thread-old",
            providerResumeToken: null,
            activeRunId: null,
            lastError: null,
            lastEventAt: 100,
            expiresAt: null,
            updatedAt: 100,
        }));
        const query = (table: string) => {
            if (table === "chats") {
                return {
                    withIndex: mock(() => ({
                        collect: chatCollect,
                    })),
                };
            }

            return {
                withIndex: mock(() => ({
                    unique: bindingUnique,
                })),
            };
        };
        const ctx = {
            db: {
                query,
                insert,
                patch,
            },
        };

        await expect(
            runHandler(runtimeBinding as unknown as HandlerExport, ctx, {
                userId: "users:test",
                agentId: "agent-b",
                conversationLocalId: "chat-1",
                chatId: "chats:agent-b",
                provider: "codex",
                status: "active",
                providerThreadId: "thread-new",
                providerResumeToken: null,
                activeRunId: "run:test",
                lastError: null,
                lastEventAt: 123,
                expiresAt: null,
                updatedAt: 123,
            }),
        ).resolves.toBeNull();

        expect(insert).not.toHaveBeenCalled();
        expect(patch).toHaveBeenCalledWith("runtimeBindings:agent-b", {
            chatId: "chats:agent-b",
            userId: "users:test",
            provider: "codex",
            status: "active",
            providerThreadId: "thread-new",
            providerResumeToken: null,
            activeRunId: "run:test",
            lastError: null,
            lastEventAt: 123,
            expiresAt: null,
            workspaceMode: undefined,
            workspaceRootPath: undefined,
            workspaceCwd: undefined,
            updatedAt: 123,
        });
    });

    test("runtimeBinding no-ops when the local id now points at a different chat", async () => {
        const insert = mock(async () => undefined);
        const patch = mock(async () => undefined);
        const chatCollect = mock(async () => [
            {
                _id: "chats:new",
                updatedAt: 100,
                createdAt: 100,
            },
        ]);
        const query = (table: string) => {
            if (table === "chats") {
                return {
                    withIndex: mock(() => ({
                        collect: chatCollect,
                    })),
                };
            }

            return {
                withIndex: mock(() => ({
                    unique: mock(async () => null),
                })),
            };
        };
        const ctx = {
            db: {
                query,
                insert,
                patch,
            },
        };

        await expect(
            runHandler(runtimeBinding as unknown as HandlerExport, ctx, {
                userId: "users:test",
                agentId: "agent-b",
                conversationLocalId: "chat-1",
                chatId: "chats:old",
                provider: "codex",
                status: "errored",
                providerThreadId: "thread-old",
                providerResumeToken: null,
                activeRunId: null,
                lastError: "stale",
                lastEventAt: 123,
                expiresAt: null,
                updatedAt: 123,
            }),
        ).resolves.toBeNull();

        expect(insert).not.toHaveBeenCalled();
        expect(patch).not.toHaveBeenCalled();
    });

    test("messageDelta no-ops when the run belongs to an older chat", async () => {
        const patch = mock(async () => undefined);
        const insert = mock(async () => undefined);
        const chatCollect = mock(async () => [
            {
                _id: "chats:new",
                updatedAt: 100,
                createdAt: 100,
            },
        ]);
        const runUnique = mock(async () => ({
            _id: "runs:1",
            chatId: "chats:old",
            provider: "codex",
            status: "running",
            providerThreadId: "thread-old",
        }));
        const messageUnique = mock(async () => ({
            _id: "messages:1",
            chatId: "chats:new",
        }));
        const bindingUnique = mock(async () => null);
        const query = mock((table: string) => {
            if (table === "chats") {
                return {
                    withIndex: mock(() => ({
                        collect: chatCollect,
                    })),
                };
            }
            if (table === "runs") {
                return {
                    withIndex: mock(() => ({
                        unique: runUnique,
                    })),
                };
            }
            if (table === "messages") {
                return {
                    withIndex: mock(() => ({
                        unique: messageUnique,
                    })),
                };
            }

            return {
                withIndex: mock(() => ({
                    unique: bindingUnique,
                })),
            };
        });
        const ctx = {
            db: {
                query,
                patch,
                insert,
            },
        };

        await expect(
            runHandler(messageDelta as unknown as HandlerExport, ctx, {
                chatId: "chats:new",
                userId: "users:test",
                agentId: "agent-1",
                conversationLocalId: "chat-1",
                assistantMessageLocalId: "assistant-1",
                externalRunId: "run:old",
                sequence: 3,
                content: "stale",
                delta: "stale",
                createdAt: 123,
            }),
        ).resolves.toBeUndefined();

        expect(patch).not.toHaveBeenCalled();
        expect(insert).not.toHaveBeenCalled();
    });

    test("runtimeBinding prefers the provided chatId when bad duplicate tuples exist", async () => {
        const patch = mock(async () => undefined);
        const insert = mock(async () => undefined);
        const chatCollect = mock(async () => [
            {
                _id: "chats:newer",
                updatedAt: 200,
                createdAt: 200,
            },
            {
                _id: "chats:current",
                updatedAt: 100,
                createdAt: 100,
            },
        ]);
        const bindingUnique = mock(async () => ({
            _id: "runtimeBindings:current",
            chatId: "chats:current",
            userId: "users:test",
            provider: "codex",
            status: "idle",
            providerThreadId: "thread-current",
            providerResumeToken: null,
            activeRunId: null,
            lastError: null,
            lastEventAt: 100,
            expiresAt: null,
            updatedAt: 100,
        }));
        const query = (table: string) => {
            if (table === "chats") {
                return {
                    withIndex: mock(() => ({
                        collect: chatCollect,
                    })),
                };
            }

            return {
                withIndex: mock(() => ({
                    unique: bindingUnique,
                })),
            };
        };
        const ctx = {
            db: {
                query,
                insert,
                patch,
            },
        };

        await expect(
            runHandler(runtimeBinding as unknown as HandlerExport, ctx, {
                userId: "users:test",
                agentId: "agent-a",
                conversationLocalId: "chat-1",
                chatId: "chats:current",
                provider: "codex",
                status: "active",
                providerThreadId: "thread-current",
                providerResumeToken: null,
                activeRunId: "run:test",
                lastError: null,
                lastEventAt: 123,
                expiresAt: null,
                updatedAt: 123,
            }),
        ).resolves.toBeNull();

        expect(insert).not.toHaveBeenCalled();
        expect(patch).toHaveBeenCalledWith("runtimeBindings:current", {
            chatId: "chats:current",
            userId: "users:test",
            provider: "codex",
            status: "active",
            providerThreadId: "thread-current",
            providerResumeToken: null,
            activeRunId: "run:test",
            lastError: null,
            lastEventAt: 123,
            expiresAt: null,
            workspaceMode: undefined,
            workspaceRootPath: undefined,
            workspaceCwd: undefined,
            updatedAt: 123,
        });
    });

    test("runCompleted ignores an older terminal write", async () => {
        const patch = mock(async () => undefined);
        const insert = mock(async () => undefined);
        const chatCollect = mock(async () => [
            {
                _id: "chats:1",
                updatedAt: 100,
                createdAt: 100,
            },
        ]);
        const runUnique = mock(async () => ({
            _id: "runs:1",
            chatId: "chats:1",
            provider: "codex",
            status: "completed",
            providerThreadId: "thread-1",
            completedAt: 200,
        }));
        const messageUnique = mock(async () => ({
            _id: "messages:1",
            chatId: "chats:1",
            localId: "assistant-1",
            updatedAt: 200,
        }));
        const query = mock((table: string) => {
            if (table === "chats") {
                return {
                    withIndex: mock(() => ({
                        collect: chatCollect,
                    })),
                };
            }
            if (table === "runs") {
                return {
                    withIndex: mock(() => ({
                        unique: runUnique,
                    })),
                };
            }
            if (table === "messages") {
                return {
                    withIndex: mock(() => ({
                        unique: messageUnique,
                    })),
                };
            }

            throw new Error(`Unexpected table ${table}`);
        });
        const ctx = {
            db: {
                query,
                patch,
                insert,
            },
        };

        await expect(
            runHandler(runCompleted as unknown as HandlerExport, ctx, {
                chatId: "chats:1",
                userId: "users:test",
                agentId: "agent-a",
                conversationLocalId: "chat-1",
                assistantMessageLocalId: "assistant-1",
                externalRunId: "run-1",
                sequence: 10,
                content: "older",
                completedAt: 150,
            }),
        ).resolves.toBeUndefined();

        expect(patch).not.toHaveBeenCalled();
        expect(insert).not.toHaveBeenCalled();
    });

    test("runtimeBinding ignores older updates than the persisted binding", async () => {
        const insert = mock(async () => undefined);
        const patch = mock(async () => undefined);
        const chatCollect = mock(async () => [
            {
                _id: "chats:1",
                updatedAt: 100,
                createdAt: 100,
            },
        ]);
        const bindingUnique = mock(async () => ({
            _id: "runtimeBindings:1",
            chatId: "chats:1",
            userId: "users:test",
            provider: "codex",
            status: "idle",
            providerThreadId: "thread-new",
            providerResumeToken: null,
            activeRunId: null,
            lastError: null,
            lastEventAt: 200,
            expiresAt: null,
            updatedAt: 200,
        }));
        const query = (table: string) => {
            if (table === "chats") {
                return {
                    withIndex: mock(() => ({
                        collect: chatCollect,
                    })),
                };
            }

            return {
                withIndex: mock(() => ({
                    unique: bindingUnique,
                })),
            };
        };
        const ctx = {
            db: {
                query,
                insert,
                patch,
            },
        };

        await expect(
            runHandler(runtimeBinding as unknown as HandlerExport, ctx, {
                userId: "users:test",
                agentId: "agent-1",
                conversationLocalId: "chat:1",
                chatId: "chats:1",
                provider: "codex",
                status: "expired",
                providerThreadId: "thread-old",
                providerResumeToken: null,
                activeRunId: null,
                lastError: null,
                lastEventAt: 100,
                expiresAt: 100,
                updatedAt: 100,
            }),
        ).resolves.toBeNull();

        expect(insert).not.toHaveBeenCalled();
        expect(patch).not.toHaveBeenCalled();
    });

    test("readRuntimeBinding resolves legacy chats even when the _id has no colon", async () => {
        const byConversationLocalIdCollect = mock(async () => []);
        const byUserCollect = mock(async () => [
            {
                _id: "legacychatid",
                updatedAt: 100,
                createdAt: 100,
                agentId: "agent-1",
                userId: "users:test",
                localId: undefined,
            },
        ]);
        const bindingUnique = mock(async () => ({
            provider: "codex",
            status: "idle",
            providerThreadId: "thread-legacy",
            providerResumeToken: null,
            activeRunId: null,
            lastError: null,
            lastEventAt: 123,
            expiresAt: null,
            updatedAt: 456,
        }));
        const query = (table: string) => {
            if (table === "chats") {
                return {
                    withIndex: mock((indexName: string) => {
                        if (indexName === "by_userId_and_agentId_and_localId") {
                            return {
                                collect: byConversationLocalIdCollect,
                            };
                        }
                        return { collect: byUserCollect };
                    }),
                };
            }

            return {
                withIndex: mock(() => ({
                    unique: bindingUnique,
                })),
            };
        };
        const ctx = {
            db: {
                query,
            },
        };

        await expect(
            runHandler(readRuntimeBinding as unknown as HandlerExport, ctx, {
                userId: "users:test",
                agentId: "agent-1",
                conversationLocalId: "legacychatid",
            }),
        ).resolves.toMatchObject({
            chatId: "legacychatid",
            binding: {
                providerThreadId: "thread-legacy",
            },
        });
    });

    test("runStarted throws when the conversation now resolves to a different chat", async () => {
        const chatCollect = mock(async () => [
            {
                _id: "chats:new",
                updatedAt: 100,
                createdAt: 100,
            },
        ]);
        const query = (table: string) => {
            if (table === "chats") {
                return {
                    withIndex: mock(() => ({
                        collect: chatCollect,
                    })),
                };
            }

            return {
                withIndex: mock(() => ({
                    unique: mock(async () => null),
                })),
            };
        };
        const ctx = {
            db: {
                query,
                patch: mock(async () => undefined),
                insert: mock(async () => "runs:1"),
            },
        };

        await expect(
            runHandler(runStarted as unknown as HandlerExport, ctx, {
                chatId: "chats:old",
                userId: "users:test",
                agentId: "agent-1",
                conversationLocalId: "chat-1",
                triggerMessageLocalId: "user-1",
                assistantMessageLocalId: "assistant-1",
                externalRunId: "run-1",
                provider: "codex",
                providerThreadId: "thread-1",
                providerTurnId: "turn-1",
                startedAt: 123,
            }),
        ).rejects.toThrow("Conversation not found");
    });
});
