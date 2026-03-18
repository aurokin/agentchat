import { describe, expect, mock, test } from "bun:test";

import { readRuntimeBinding, runtimeBinding } from "../runtimeIngress";

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
        const withIndex = mock(() => ({ unique }));
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
});
