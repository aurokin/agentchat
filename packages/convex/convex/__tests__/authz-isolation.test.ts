import { describe, expect, test } from "bun:test";
import {
    create as createChat,
    get as getChat,
    listByUser as listChatsByUser,
    update as updateChat,
} from "../chats";
import {
    create as createMessage,
    get as getMessage,
    update as updateMessage,
} from "../messages";
import { get as getUser } from "../users";

const AUTH_USER_ID = "users:auth";
const OTHER_USER_ID = "users:other";
const CHAT_ID = "chats:other";
const MESSAGE_ID = "messages:other";

type HandlerExport = {
    _handler: (ctx: any, args: any) => Promise<unknown>;
};

function runHandler(handler: HandlerExport, ctx: any, args: any) {
    return handler._handler(ctx, args);
}

function createAuthenticatedContext(
    docsById: Record<string, unknown> = {},
    overrides?: {},
) {
    const baseDocs: Record<string, unknown> = {
        [AUTH_USER_ID]: {
            _id: AUTH_USER_ID,
            entitlementActive: true,
        },
    };
    const ctx = {
        auth: {
            getUserIdentity: async () => ({
                subject: `${AUTH_USER_ID}|session:auth`,
            }),
        },
        db: {
            get: async (id: string) => {
                const allDocs = { ...baseDocs, ...docsById };
                return allDocs[id] ?? null;
            },
            query: () => {
                throw new Error("Unexpected query call in this test");
            },
            patch: async () => {
                throw new Error("Unexpected patch call in this test");
            },
            insert: async () => {
                throw new Error("Unexpected insert call in this test");
            },
            delete: async () => {
                throw new Error("Unexpected delete call in this test");
            },
        },
    };

    return { ctx };
}

describe("cross-user auth isolation", () => {
    test("users.get rejects requesting another user id", async () => {
        const { ctx } = createAuthenticatedContext();

        await expect(
            runHandler(getUser as unknown as HandlerExport, ctx, {
                id: OTHER_USER_ID,
            }),
        ).rejects.toThrow("Unauthorized");
    });

    test("chats.listByUser rejects userId mismatch", async () => {
        const { ctx } = createAuthenticatedContext();

        await expect(
            runHandler(listChatsByUser as unknown as HandlerExport, ctx, {
                userId: OTHER_USER_ID,
            }),
        ).rejects.toThrow("Unauthorized");
    });

    test("chats.get returns null for non-owner chat", async () => {
        const { ctx } = createAuthenticatedContext({
            [CHAT_ID]: {
                _id: CHAT_ID,
                userId: OTHER_USER_ID,
            },
        });

        const result = await runHandler(
            getChat as unknown as HandlerExport,
            ctx,
            { id: CHAT_ID },
        );

        expect(result).toBeNull();
    });

    test("messages.get returns null for non-owner message", async () => {
        const { ctx } = createAuthenticatedContext({
            [MESSAGE_ID]: {
                _id: MESSAGE_ID,
                userId: OTHER_USER_ID,
            },
        });

        const result = await runHandler(
            getMessage as unknown as HandlerExport,
            ctx,
            { id: MESSAGE_ID },
        );

        expect(result).toBeNull();
    });

    test("chats.update rejects updating another user's chat", async () => {
        const { ctx } = createAuthenticatedContext({
            [CHAT_ID]: {
                _id: CHAT_ID,
                userId: OTHER_USER_ID,
            },
        });

        await expect(
            runHandler(updateChat as unknown as HandlerExport, ctx, {
                id: CHAT_ID,
                title: "attempted takeover",
            }),
        ).rejects.toThrow("Not found");
    });

    test("messages.update rejects updating another user's message", async () => {
        const { ctx } = createAuthenticatedContext({
            [MESSAGE_ID]: {
                _id: MESSAGE_ID,
                userId: OTHER_USER_ID,
            },
        });

        await expect(
            runHandler(updateMessage as unknown as HandlerExport, ctx, {
                id: MESSAGE_ID,
                content: "attempted overwrite",
            }),
        ).rejects.toThrow("Not found");
    });

    test("chats.create rejects creating chat for another user id", async () => {
        const { ctx } = createAuthenticatedContext();

        await expect(
            runHandler(createChat as unknown as HandlerExport, ctx, {
                userId: OTHER_USER_ID,
                title: "Chat",
                modelId: "openrouter/model",
                thinking: "none",
            }),
        ).rejects.toThrow("Unauthorized");
    });

    test("messages.create rejects creating message for another user id", async () => {
        const { ctx } = createAuthenticatedContext();

        await expect(
            runHandler(createMessage as unknown as HandlerExport, ctx, {
                userId: OTHER_USER_ID,
                chatId: CHAT_ID,
                role: "user",
                content: "hello",
                contextContent: "hello",
            }),
        ).rejects.toThrow("Unauthorized");
    });
});
