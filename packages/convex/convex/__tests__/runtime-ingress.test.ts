import { describe, expect, mock, test } from "bun:test";

import {
    chatExistsByLocalId,
    listAllChatLocalIds,
    messageDelta,
    messageStarted,
    providerEvent,
    readRuntimeBinding,
    recoverStaleRun,
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
    test("providerEvent appends sanitized provider metadata to run events", async () => {
        const insert = mock(async () => "runEvents:1");
        const chatCollect = mock(async () => [
            {
                _id: "chats:1",
                userId: "users:test",
                agentId: "agent-1",
                localId: "chat-1",
            },
        ]);
        const runUnique = mock(async () => ({
            _id: "runs:1",
            chatId: "chats:1",
            userId: "users:test",
            externalId: "run:test",
            provider: "codex-default",
            status: "running",
        }));
        const query = mock((table: string) => {
            if (table === "chats") {
                return {
                    withIndex: mock(() => ({
                        collect: chatCollect,
                    })),
                };
            }

            return {
                withIndex: mock(() => ({
                    unique: runUnique,
                })),
            };
        });
        const ctx = {
            db: {
                query,
                insert,
            },
        };

        await expect(
            runHandler(providerEvent as unknown as HandlerExport, ctx, {
                chatId: "chats:1",
                userId: "users:test",
                agentId: "agent-1",
                conversationLocalId: "chat-1",
                externalRunId: "run:test",
                sequence: 3,
                provider: "codex-default",
                providerKind: "codex",
                eventId: "event-1",
                eventType: "codex.turn.completed",
                phase: "completion",
                summary: "Codex turn completed with status completed.",
                stable: true,
                metadataJson: JSON.stringify({
                    status: "completed",
                    inputTokens: 12,
                }),
                occurredAt: 123,
            }),
        ).resolves.toBeUndefined();

        expect(insert).toHaveBeenCalledWith("run_events", {
            runId: "runs:1",
            chatId: "chats:1",
            userId: "users:test",
            sequence: 3,
            kind: "provider_status",
            messageId: null,
            textDelta: null,
            errorMessage: null,
            data: JSON.stringify({
                provider: "codex-default",
                providerKind: "codex",
                eventId: "event-1",
                eventType: "codex.turn.completed",
                phase: "completion",
                summary: "Codex turn completed with status completed.",
                stable: true,
                metadata: JSON.stringify({
                    status: "completed",
                    inputTokens: 12,
                }),
            }),
            createdAt: 123,
        });
    });

    test("runtimeBinding no-ops when the conversation no longer exists", async () => {
        const insert = mock(async () => undefined);
        const patch = mock(async () => undefined);
        const unique = mock(async () => null);
        const collect = mock(async () => []);
        const withIndex = mock((indexName: string) =>
            indexName === "by_userId_and_agentId_and_localId"
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
        expect(collect).toHaveBeenCalledTimes(1);
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

    test("runStarted writes workspace metadata into a new runtime binding", async () => {
        const insert = mock(async (table: string) => {
            if (table === "runs") {
                return "runs:1";
            }
            return undefined;
        });
        const patch = mock(async () => undefined);
        const chatCollect = mock(async () => [
            {
                _id: "chats:1",
                updatedAt: 100,
                createdAt: 100,
                settingsLockedAt: null,
            },
        ]);
        let messageLookupCount = 0;
        const messageCollect = mock(async () => {
            messageLookupCount += 1;
            return [
                {
                    _id:
                        messageLookupCount === 2
                            ? "messages:trigger"
                            : "messages:assistant",
                    chatId: "chats:1",
                    userId: "users:test",
                    kind: "assistant_message",
                    content: "",
                    contextContent: "",
                    status: "draft",
                    runId: null,
                    runMessageIndex: null,
                    updatedAt: 100,
                    completedAt: null,
                },
            ];
        });
        const runUnique = mock(async () => null);
        const bindingUnique = mock(async () => null);
        const query = mock((table: string) => {
            if (table === "chats") {
                return {
                    withIndex: mock(() => ({
                        collect: chatCollect,
                    })),
                };
            }
            if (table === "messages") {
                return {
                    withIndex: mock(() => ({
                        collect: messageCollect,
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

            return {
                withIndex: mock(() => ({
                    unique: bindingUnique,
                })),
            };
        });
        const ctx = {
            db: {
                query,
                insert,
                patch,
            },
        };

        await expect(
            runHandler(runStarted as unknown as HandlerExport, ctx, {
                chatId: "chats:1",
                userId: "users:test",
                agentId: "agent-1",
                conversationLocalId: "chat-1",
                triggerMessageLocalId: "user-1",
                assistantMessageLocalId: "assistant-1",
                externalRunId: "run:test",
                provider: "codex",
                providerThreadId: "thread-1",
                providerTurnId: "turn-1",
                workspaceMode: "copy-on-conversation",
                workspaceRootPath: "/repos/agent-a",
                workspaceCwd: "/sandboxes/agent-a/user/chat-1",
                startedAt: 123,
            }),
        ).resolves.toEqual({
            runId: "runs:1",
        });

        expect(insert).toHaveBeenCalledWith("runtime_bindings", {
            chatId: "chats:1",
            userId: "users:test",
            provider: "codex",
            status: "active",
            providerThreadId: "thread-1",
            providerResumeToken: null,
            activeRunId: "run:test",
            lastError: null,
            lastEventAt: 123,
            expiresAt: null,
            workspaceMode: "copy-on-conversation",
            workspaceRootPath: "/repos/agent-a",
            workspaceCwd: "/sandboxes/agent-a/user/chat-1",
            updatedAt: 123,
        });
    });

    test("runCompleted keeps workspace metadata on terminal runtime binding updates", async () => {
        const insert = mock(async () => undefined);
        const patch = mock(async () => undefined);
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
            userId: "users:test",
            provider: "codex",
            status: "running",
            outputMessageId: "messages:assistant",
            providerThreadId: "thread-1",
        }));
        const messageCollect = mock(async () => [
            {
                _id: "messages:assistant",
                chatId: "chats:1",
                userId: "users:test",
                kind: "assistant_message",
                content: "old",
                contextContent: "old",
                status: "streaming",
                runId: "run:test",
                runMessageIndex: 0,
                updatedAt: 100,
                completedAt: null,
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
            workspaceCwd: "/sandboxes/agent-a/user/chat-1",
            updatedAt: 100,
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
                        collect: messageCollect,
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
                insert,
                patch,
            },
        };

        await expect(
            runHandler(runCompleted as unknown as HandlerExport, ctx, {
                chatId: "chats:1",
                userId: "users:test",
                agentId: "agent-1",
                conversationLocalId: "chat-1",
                assistantMessageLocalId: "assistant-1",
                externalRunId: "run:test",
                sequence: 3,
                content: "done",
                workspaceMode: "copy-on-conversation",
                workspaceRootPath: "/repos/agent-a",
                workspaceCwd: "/sandboxes/agent-a/user/chat-1",
                completedAt: 123,
            }),
        ).resolves.toBeUndefined();

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
            workspaceCwd: "/sandboxes/agent-a/user/chat-1",
            updatedAt: 123,
        });
    });

    test("recoverStaleRun keeps workspace metadata on recovered terminal bindings", async () => {
        const insert = mock(async () => undefined);
        const patch = mock(async () => undefined);
        const get = mock(async (id: string) => {
            if (id === "messages:assistant") {
                return {
                    _id: "messages:assistant",
                    localId: "assistant-1",
                    content: "orphaned content",
                };
            }
            return null;
        });
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
            userId: "users:test",
            provider: "codex",
            status: "running",
            outputMessageId: "messages:assistant",
            providerThreadId: "thread-1",
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
            workspaceCwd: "/sandboxes/agent-a/user/chat-1",
            updatedAt: 100,
        }));
        const messageCollect = mock(async () => [
            {
                _id: "messages:assistant",
                chatId: "chats:1",
                userId: "users:test",
                kind: "assistant_message",
                content: "old",
                contextContent: "old",
                status: "streaming",
                runId: "run:test",
                runMessageIndex: 0,
                updatedAt: 100,
                completedAt: null,
            },
        ]);
        const runEventsTake = mock(async () => []);
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
                        collect: messageCollect,
                    })),
                };
            }
            if (table === "run_events") {
                return {
                    withIndex: mock(() => ({
                        order: mock(() => ({
                            take: runEventsTake,
                        })),
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
                get,
            },
        };

        await expect(
            runHandler(recoverStaleRun as unknown as HandlerExport, ctx, {
                chatId: "chats:1",
                userId: "users:test",
                agentId: "agent-1",
                conversationLocalId: "chat-1",
                externalRunId: "run:test",
                completedAt: 123,
                errorMessage: "stale",
                workspaceMode: "copy-on-conversation",
                workspaceRootPath: "/repos/agent-a",
                workspaceCwd: "/sandboxes/agent-a/user/chat-1",
            }),
        ).resolves.toBeUndefined();

        expect(patch).toHaveBeenCalledWith("runtimeBindings:1", {
            chatId: "chats:1",
            userId: "users:test",
            provider: "codex",
            status: "errored",
            providerThreadId: "thread-1",
            providerResumeToken: null,
            activeRunId: null,
            lastError: "stale",
            lastEventAt: 123,
            expiresAt: null,
            workspaceMode: "copy-on-conversation",
            workspaceRootPath: "/repos/agent-a",
            workspaceCwd: "/sandboxes/agent-a/user/chat-1",
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
        let callCount = 0;
        const collect = mock(async () =>
            callCount++ === 0
                ? [
                      {
                          _id: "chats:2",
                          agentId: "agent-b",
                          userId: "users:test",
                          localId: "chat-1",
                      },
                  ]
                : [],
        );
        const legacyCollect = mock(async () => []);
        const withIndex = mock((indexName: string) =>
            indexName === "by_userId_and_agentId_and_localId"
                ? { collect }
                : { collect: legacyCollect },
        );
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

    test("falls back to agent-local lookup when the supplied chatId is stale", async () => {
        const collect = mock(async () => [
            {
                _id: "chats:live",
                agentId: "agent-a",
                userId: "users:test",
                localId: "chat-1",
            },
        ]);
        const legacyCollect = mock(async () => []);
        const withIndex = mock((indexName: string) =>
            indexName === "by_userId_and_agentId_and_localId"
                ? { collect }
                : { collect: legacyCollect },
        );
        const query = mock(() => ({ withIndex }));
        const get = mock(async () => null);
        const ctx = {
            db: {
                get,
                query,
            },
        };

        await expect(
            runHandler(chatExistsByLocalId as unknown as HandlerExport, ctx, {
                userId: "users:test",
                agentId: "agent-a",
                localId: "chat-1",
                chatId: "chats:stale",
            }),
        ).resolves.toBe(true);

        expect(get).toHaveBeenCalledWith("chats:stale");
        expect(query).toHaveBeenCalledWith("chats");
    });

    test("falls back to legacy chat ids when a chat has no localId", async () => {
        const collect = mock(async () => []);
        const legacyCollect = mock(async () => [
            {
                _id: "chats:legacy",
                agentId: "agent-a",
                userId: "users:test",
                localId: null,
            },
        ]);
        const withIndex = mock((indexName: string) =>
            indexName === "by_userId_and_agentId_and_localId"
                ? { collect }
                : { collect: legacyCollect },
        );
        const query = mock(() => ({ withIndex }));
        const ctx = {
            db: {
                query,
            },
        };

        await expect(
            runHandler(chatExistsByLocalId as unknown as HandlerExport, ctx, {
                userId: "users:test",
                agentId: "agent-a",
                localId: "chats:legacy",
            }),
        ).resolves.toBe(true);
    });

    test("treats duplicate agent-local matches as existing", async () => {
        const collect = mock(async () => [
            {
                _id: "chats:1",
                agentId: "agent-a",
                userId: "users:test",
                localId: "chat-1",
            },
            {
                _id: "chats:2",
                agentId: "agent-a",
                userId: "users:test",
                localId: "chat-1",
            },
        ]);
        const withIndex = mock((indexName: string) =>
            indexName === "by_userId_and_agentId_and_localId"
                ? { collect }
                : { collect: mock(async () => []) },
        );
        const query = mock(() => ({ withIndex }));
        const ctx = {
            db: {
                query,
            },
        };

        await expect(
            runHandler(chatExistsByLocalId as unknown as HandlerExport, ctx, {
                userId: "users:test",
                agentId: "agent-a",
                localId: "chat-1",
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

    test("readRuntimeBinding fails safe when duplicate chats share the same agent and local id", async () => {
        const chatCollect = mock(async () => [
            {
                _id: "chats:older",
                updatedAt: 100,
                createdAt: 100,
            },
            {
                _id: "chats:newer",
                updatedAt: 200,
                createdAt: 200,
            },
        ]);
        const bindingUnique = mock(async () => ({
            provider: "codex",
            status: "idle",
            providerThreadId: "thread-should-not-load",
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
                agentId: "agent-a",
                conversationLocalId: "chat-1",
            }),
        ).resolves.toBeNull();

        expect(bindingUnique).not.toHaveBeenCalled();
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
        const messageCollect = mock(async () => [
            {
                _id: "messages:1",
                chatId: "chats:new",
                userId: "users:test",
            },
        ]);
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
                        collect: messageCollect,
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

    test("messageDelta uses the in-chat assistant message when another chat reuses the same localId", async () => {
        const patch = mock(async () => undefined);
        const insert = mock(async () => undefined);
        const chatCollect = mock(async () => [
            {
                _id: "chats:current",
                updatedAt: 100,
                createdAt: 100,
            },
        ]);
        const runUnique = mock(async () => ({
            _id: "runs:1",
            chatId: "chats:current",
            provider: "codex",
            status: "running",
            providerThreadId: "thread-current",
        }));
        const messageCollect = mock(async () => [
            {
                _id: "messages:current",
                chatId: "chats:current",
                userId: "users:test",
                kind: "assistant_message",
                content: "old",
                contextContent: "old",
                status: "streaming",
                runId: "run:current",
                runMessageIndex: 0,
                updatedAt: 50,
                completedAt: null,
            },
        ]);
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
                        collect: messageCollect,
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
                chatId: "chats:current",
                userId: "users:test",
                agentId: "agent-1",
                conversationLocalId: "chat-1",
                assistantMessageLocalId: "assistant-1",
                externalRunId: "run:current",
                sequence: 3,
                content: "new content",
                delta: "delta",
                createdAt: 123,
            }),
        ).resolves.toBeUndefined();

        expect(patch).toHaveBeenCalledWith("messages:current", {
            kind: "assistant_message",
            content: "new content",
            contextContent: "new content",
            status: "streaming",
            runId: "run:current",
            runMessageIndex: 0,
            updatedAt: 123,
            completedAt: null,
        });
    });

    test("messageDelta creates the assistant message when the first delta arrives before messageStarted", async () => {
        const patch = mock(async () => undefined);
        const insert = mock(async (table: string) => {
            if (table === "messages") {
                return "messages:created";
            }
            return `${table}:created`;
        });
        const get = mock(async (id: string) => {
            if (id !== "messages:created") {
                return null;
            }

            return {
                _id: "messages:created",
                userId: "users:test",
                chatId: "chats:current",
                localId: "assistant-1",
                role: "assistant",
                kind: "assistant_message",
                content: "first chunk",
                contextContent: "first chunk",
                status: "streaming",
                runId: "run:current",
                runMessageIndex: 0,
                createdAt: 123,
                updatedAt: 123,
                completedAt: null,
            };
        });
        const chatCollect = mock(async () => [
            {
                _id: "chats:current",
                updatedAt: 100,
                createdAt: 100,
            },
        ]);
        const runUnique = mock(async () => ({
            _id: "runs:1",
            chatId: "chats:current",
            provider: "codex",
            status: "running",
            providerThreadId: "thread-current",
        }));
        const messageCollect = mock(async () => []);
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
                        collect: messageCollect,
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
                get,
            },
        };

        await expect(
            runHandler(messageDelta as unknown as HandlerExport, ctx, {
                chatId: "chats:current",
                userId: "users:test",
                agentId: "agent-1",
                conversationLocalId: "chat-1",
                assistantMessageLocalId: "assistant-1",
                externalRunId: "run:current",
                sequence: 3,
                content: "first chunk",
                delta: "first chunk",
                createdAt: 123,
            }),
        ).resolves.toBeUndefined();

        expect(insert).toHaveBeenCalledWith("messages", {
            userId: "users:test",
            chatId: "chats:current",
            localId: "assistant-1",
            role: "assistant",
            kind: "assistant_message",
            content: "first chunk",
            contextContent: "first chunk",
            status: "streaming",
            runId: "run:current",
            reasoning: undefined,
            runMessageIndex: 0,
            modelId: undefined,
            variantId: null,
            reasoningEffort: undefined,
            createdAt: 123,
            updatedAt: 123,
            completedAt: null,
        });
        expect(patch).not.toHaveBeenCalledWith(
            "messages:created",
            expect.anything(),
        );
    });

    test("messageStarted no-ops when a newer assistant message already exists", async () => {
        const patch = mock(async () => undefined);
        const insert = mock(async () => undefined);
        const chatCollect = mock(async () => [
            {
                _id: "chats:current",
                updatedAt: 100,
                createdAt: 100,
            },
        ]);
        const runUnique = mock(async () => ({
            _id: "runs:1",
            chatId: "chats:current",
            provider: "codex",
            status: "running",
            providerThreadId: "thread-current",
        }));
        const triggerMessageCollect = mock(async () => [
            {
                _id: "messages:trigger",
                chatId: "chats:current",
                userId: "users:test",
                updatedAt: 90,
            },
        ]);
        const assistantMessageCollect = mock(async () => [
            {
                _id: "messages:assistant",
                chatId: "chats:current",
                userId: "users:test",
                kind: "assistant_message",
                content: "already newer",
                contextContent: "already newer",
                status: "streaming",
                runId: "run:current",
                runMessageIndex: 0,
                updatedAt: 200,
                completedAt: null,
            },
        ]);
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
                    withIndex: mock((indexName: string) => ({
                        collect:
                            indexName === "by_chatId_and_localId"
                                ? assistantMessageCollect
                                : triggerMessageCollect,
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
            runHandler(messageStarted as unknown as HandlerExport, ctx, {
                chatId: "chats:current",
                userId: "users:test",
                agentId: "agent-1",
                conversationLocalId: "chat-1",
                previousAssistantMessageLocalId: "assistant-prev",
                previousCompletedSequence: 2,
                assistantMessageLocalId: "assistant-new",
                messageStartedSequence: 3,
                externalRunId: "run:current",
                kind: "assistant_message",
                runMessageIndex: 1,
                previousContent: "old",
                content: "new",
                createdAt: 100,
            }),
        ).resolves.toBeUndefined();

        expect(patch).not.toHaveBeenCalled();
        expect(insert).not.toHaveBeenCalled();
    });

    test("messageDelta no-ops when a newer assistant message already exists", async () => {
        const patch = mock(async () => undefined);
        const insert = mock(async () => undefined);
        const chatCollect = mock(async () => [
            {
                _id: "chats:current",
                updatedAt: 100,
                createdAt: 100,
            },
        ]);
        const runUnique = mock(async () => ({
            _id: "runs:1",
            chatId: "chats:current",
            provider: "codex",
            status: "running",
            providerThreadId: "thread-current",
        }));
        const messageCollect = mock(async () => [
            {
                _id: "messages:current",
                chatId: "chats:current",
                userId: "users:test",
                kind: "assistant_message",
                content: "already newer",
                contextContent: "already newer",
                status: "streaming",
                runId: "run:current",
                runMessageIndex: 0,
                updatedAt: 200,
                completedAt: null,
            },
        ]);
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
                        collect: messageCollect,
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
                chatId: "chats:current",
                userId: "users:test",
                agentId: "agent-1",
                conversationLocalId: "chat-1",
                assistantMessageLocalId: "assistant-1",
                externalRunId: "run:current",
                sequence: 3,
                content: "new content",
                delta: "delta",
                createdAt: 100,
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

    test("runCompleted ignores an equal-timestamp terminal write", async () => {
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
                content: "same-time",
                completedAt: 200,
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

    test("runtimeBinding ignores equal-timestamp updates as stale", async () => {
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
                lastEventAt: 200,
                expiresAt: 200,
                updatedAt: 200,
            }),
        ).resolves.toBeNull();

        expect(insert).not.toHaveBeenCalled();
        expect(patch).not.toHaveBeenCalled();
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
