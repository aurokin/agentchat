import { describe, expect, test } from "bun:test";
import {
    create as createAttachment,
    get as getAttachment,
    remove as removeAttachment,
} from "../attachments";
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
const ATTACHMENT_ID = "attachments:other";
const STORAGE_ID = "_storage:other";

type HandlerExport = {
    _handler: (ctx: any, args: any) => Promise<unknown>;
};

function runHandler(handler: HandlerExport, ctx: any, args: any) {
    return handler._handler(ctx, args);
}

function createAuthenticatedContext(
    docsById: Record<string, unknown> = {},
    overrides?: {
        onGetMetadata?: (storageId: string) => Promise<unknown>;
    },
) {
    const baseDocs: Record<string, unknown> = {
        [AUTH_USER_ID]: {
            _id: AUTH_USER_ID,
            entitlementActive: true,
        },
    };

    const getMetadataCalls: string[] = [];

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
        storage: {
            getMetadata: async (storageId: string) => {
                getMetadataCalls.push(storageId);
                if (overrides?.onGetMetadata) {
                    return await overrides.onGetMetadata(storageId);
                }
                return null;
            },
            delete: async () => {},
        },
    };

    return { ctx, getMetadataCalls };
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

    test("attachments.get returns null for non-owner attachment", async () => {
        const { ctx } = createAuthenticatedContext({
            [ATTACHMENT_ID]: {
                _id: ATTACHMENT_ID,
                userId: OTHER_USER_ID,
                storageId: STORAGE_ID,
            },
        });

        const result = await runHandler(
            getAttachment as unknown as HandlerExport,
            ctx,
            { id: ATTACHMENT_ID },
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

    test("attachments.remove rejects deleting another user's attachment", async () => {
        const { ctx } = createAuthenticatedContext({
            [ATTACHMENT_ID]: {
                _id: ATTACHMENT_ID,
                userId: OTHER_USER_ID,
                storageId: STORAGE_ID,
            },
        });

        await expect(
            runHandler(removeAttachment as unknown as HandlerExport, ctx, {
                id: ATTACHMENT_ID,
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
                searchLevel: "none",
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

    test("attachments.create rejects userId mismatch before reading storage metadata", async () => {
        const { ctx, getMetadataCalls } = createAuthenticatedContext(
            {},
            {
                onGetMetadata: async () => ({
                    storageId: STORAGE_ID,
                    sha256: "abc",
                    size: 12,
                    contentType: "image/png",
                }),
            },
        );

        await expect(
            runHandler(createAttachment as unknown as HandlerExport, ctx, {
                userId: OTHER_USER_ID,
                messageId: MESSAGE_ID,
                localId: "local-1",
                type: "image",
                mimeType: "image/png",
                storageId: STORAGE_ID,
                width: 1,
                height: 1,
                size: 12,
            }),
        ).rejects.toThrow("Unauthorized");

        expect(getMetadataCalls).toHaveLength(0);
    });
});
