import { describe, expect, mock, test } from "bun:test";

import {
    chatExistsByLocalId,
    listAllChatLocalIds,
    readRuntimeBinding,
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
            indexName === "by_user" ? { collect } : { unique },
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
        expect(unique).toHaveBeenCalledTimes(1);
        expect(collect).toHaveBeenCalledTimes(1);
        expect(insert).not.toHaveBeenCalled();
        expect(patch).not.toHaveBeenCalled();
    });

    test("preserves existing workspace metadata when later binding writes omit it", async () => {
        const insert = mock(async () => undefined);
        const patch = mock(async () => undefined);
        const chatUnique = mock(async () => ({
            _id: "chats:1",
        }));
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
                    withIndex: mock(() => ({ unique: chatUnique })),
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
        const chatUnique = mock(async () => ({
            _id: "chats:1",
        }));
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
                        unique: chatUnique,
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
        const chatUnique = mock(async () => ({
            _id: "chats:agent-b",
        }));
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
                        unique: chatUnique,
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
            providerThreadId: "thread-b",
            workspaceRootPath: "/repos/agent-b",
        });
    });

    test("runtimeBinding updates the matching agent when chats share a localId", async () => {
        const insert = mock(async () => undefined);
        const patch = mock(async () => undefined);
        const chatUnique = mock(async () => ({
            _id: "chats:agent-b",
        }));
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
                        unique: chatUnique,
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
});
