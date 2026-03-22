import { describe, expect, mock, test } from "bun:test";

import {
    create,
    getByLocalId,
    markViewed,
    update as updateChat,
} from "../chats";

const AUTH_USER_ID = "users:auth";
const CHAT_ID = "chats:1";

type HandlerExport = {
    _handler: (ctx: unknown, args: unknown) => Promise<unknown>;
};

function runHandler(handler: HandlerExport, ctx: unknown, args: unknown) {
    return handler._handler(ctx, args);
}

describe("chat settings lock", () => {
    test("rejects duplicate local ids within the same agent", async () => {
        const insert = mock(async () => CHAT_ID);
        const query = mock(() => ({
            withIndex: mock(() => ({
                collect: mock(async () => [
                    {
                        _id: CHAT_ID,
                        userId: AUTH_USER_ID,
                        localId: "chat-local-1",
                        agentId: "agent-a",
                    },
                ]),
            })),
        }));
        const ctx = {
            auth: {
                getUserIdentity: async () => ({
                    subject: `${AUTH_USER_ID}|session:auth`,
                }),
            },
            db: {
                get: async (id: string) => {
                    if (id === AUTH_USER_ID) {
                        return { _id: AUTH_USER_ID };
                    }

                    return null;
                },
                query,
                insert,
            },
        };

        await expect(
            runHandler(create as unknown as HandlerExport, ctx, {
                userId: AUTH_USER_ID,
                localId: "chat-local-1",
                agentId: "agent-a",
                title: "Duplicate",
                modelId: "gpt-5.4",
                variantId: null,
            }),
        ).rejects.toThrow(
            "Conversation localId already exists for this agent.",
        );

        expect(insert).not.toHaveBeenCalled();
    });

    test("rejects changing model settings after the first message", async () => {
        const patch = mock(async () => undefined);
        const ctx = {
            auth: {
                getUserIdentity: async () => ({
                    subject: `${AUTH_USER_ID}|session:auth`,
                }),
            },
            db: {
                get: async (id: string) => {
                    if (id === CHAT_ID) {
                        return {
                            _id: CHAT_ID,
                            userId: AUTH_USER_ID,
                            title: "Locked",
                            modelId: "gpt-5.3-codex",
                            settingsLockedAt: 123,
                            updatedAt: 123,
                        };
                    }

                    if (id === AUTH_USER_ID) {
                        return { _id: AUTH_USER_ID };
                    }

                    return null;
                },
                patch,
            },
        };

        await expect(
            runHandler(updateChat as unknown as HandlerExport, ctx, {
                id: CHAT_ID,
                modelId: "gpt-5.3-codex-lite",
            }),
        ).rejects.toThrow(
            "Conversation settings are locked after the first message.",
        );
        expect(patch).not.toHaveBeenCalled();
    });

    test("still allows title updates after settings lock", async () => {
        const patch = mock(async () => undefined);
        const ctx = {
            auth: {
                getUserIdentity: async () => ({
                    subject: `${AUTH_USER_ID}|session:auth`,
                }),
            },
            db: {
                get: async (id: string) => {
                    if (id === CHAT_ID) {
                        return {
                            _id: CHAT_ID,
                            userId: AUTH_USER_ID,
                            title: "Locked",
                            modelId: "gpt-5.3-codex",
                            settingsLockedAt: 123,
                            updatedAt: 123,
                        };
                    }

                    if (id === AUTH_USER_ID) {
                        return { _id: AUTH_USER_ID };
                    }

                    return null;
                },
                patch,
            },
        };

        await runHandler(updateChat as unknown as HandlerExport, ctx, {
            id: CHAT_ID,
            title: "Renamed",
        });

        expect(patch).toHaveBeenCalledTimes(1);
    });

    test("marks chats viewed without mutating updatedAt", async () => {
        const patch = mock(async () => undefined);
        const ctx = {
            auth: {
                getUserIdentity: async () => ({
                    subject: `${AUTH_USER_ID}|session:auth`,
                }),
            },
            db: {
                get: async (id: string) => {
                    if (id === CHAT_ID) {
                        return {
                            _id: CHAT_ID,
                            userId: AUTH_USER_ID,
                            title: "Viewed",
                            modelId: "gpt-5.3-codex",
                            settingsLockedAt: null,
                            lastViewedAt: 50,
                            updatedAt: 100,
                        };
                    }

                    if (id === AUTH_USER_ID) {
                        return { _id: AUTH_USER_ID };
                    }

                    return null;
                },
                patch,
            },
        };

        await runHandler(markViewed as unknown as HandlerExport, ctx, {
            id: CHAT_ID,
            timestamp: 75,
        });

        expect(patch).toHaveBeenCalledWith(CHAT_ID, {
            lastViewedAt: 75,
        });
    });

    test("fails safely when duplicate agent local ids already exist", async () => {
        const ctx = {
            auth: {
                getUserIdentity: async () => ({
                    subject: `${AUTH_USER_ID}|session:auth`,
                }),
            },
            db: {
                get: async (id: string) => {
                    if (id === AUTH_USER_ID) {
                        return { _id: AUTH_USER_ID };
                    }

                    return null;
                },
                query: mock(() => ({
                    withIndex: mock(() => ({
                        collect: mock(async () => [
                            {
                                _id: "chats:duplicate-1",
                                userId: AUTH_USER_ID,
                                localId: "chat-local-1",
                                agentId: "agent-a",
                                updatedAt: 200,
                                createdAt: 100,
                            },
                            {
                                _id: "chats:duplicate-2",
                                userId: AUTH_USER_ID,
                                localId: "chat-local-1",
                                agentId: "agent-a",
                                updatedAt: 100,
                                createdAt: 50,
                            },
                        ]),
                    })),
                })),
            },
        };

        await expect(
            runHandler(getByLocalId as unknown as HandlerExport, ctx, {
                userId: AUTH_USER_ID,
                agentId: "agent-a",
                localId: "chat-local-1",
            }),
        ).resolves.toBeNull();
    });
});
