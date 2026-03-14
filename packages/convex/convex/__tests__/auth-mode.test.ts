import { afterEach, describe, expect, mock, test } from "bun:test";

import { getAgentchatAuthMode, getDisabledUserProfile } from "../lib/auth_mode";
import { ensureAccessUser, resetWorkspaceData } from "../users";

type HandlerExport = {
    _handler: (ctx: unknown, args: unknown) => Promise<unknown>;
};

function runHandler(handler: HandlerExport, ctx: unknown, args: unknown) {
    return handler._handler(ctx, args);
}

const originalEnv = {
    AGENTCHAT_AUTH_MODE: process.env.AGENTCHAT_AUTH_MODE,
    AGENTCHAT_DEFAULT_USER_EMAIL: process.env.AGENTCHAT_DEFAULT_USER_EMAIL,
    AGENTCHAT_DEFAULT_USER_NAME: process.env.AGENTCHAT_DEFAULT_USER_NAME,
    AGENTCHAT_DEFAULT_USER_SUBJECT: process.env.AGENTCHAT_DEFAULT_USER_SUBJECT,
};

afterEach(() => {
    process.env.AGENTCHAT_AUTH_MODE = originalEnv.AGENTCHAT_AUTH_MODE;
    process.env.AGENTCHAT_DEFAULT_USER_EMAIL =
        originalEnv.AGENTCHAT_DEFAULT_USER_EMAIL;
    process.env.AGENTCHAT_DEFAULT_USER_NAME =
        originalEnv.AGENTCHAT_DEFAULT_USER_NAME;
    process.env.AGENTCHAT_DEFAULT_USER_SUBJECT =
        originalEnv.AGENTCHAT_DEFAULT_USER_SUBJECT;
});

describe("auth mode", () => {
    test("defaults to google auth mode", () => {
        delete process.env.AGENTCHAT_AUTH_MODE;

        expect(getAgentchatAuthMode()).toBe("google");
    });

    test("reads disabled default user profile overrides", () => {
        process.env.AGENTCHAT_AUTH_MODE = "disabled";
        process.env.AGENTCHAT_DEFAULT_USER_EMAIL = "operator@local";
        process.env.AGENTCHAT_DEFAULT_USER_NAME = "Operator";
        process.env.AGENTCHAT_DEFAULT_USER_SUBJECT = "operator-subject";

        expect(getAgentchatAuthMode()).toBe("disabled");
        expect(getDisabledUserProfile()).toEqual({
            email: "operator@local",
            name: "Operator",
            subject: "operator-subject",
        });
    });

    test("ensureAccessUser creates the default user when auth is disabled", async () => {
        process.env.AGENTCHAT_AUTH_MODE = "disabled";
        process.env.AGENTCHAT_DEFAULT_USER_EMAIL = "default@local.agentchat";
        process.env.AGENTCHAT_DEFAULT_USER_NAME = "Default User";

        const insert = mock(async () => "users:default");
        const patch = mock(async () => undefined);
        const ctx = {
            db: {
                query: () => ({
                    withIndex: () => ({
                        unique: async () => null,
                    }),
                }),
                insert,
                patch,
                get: async () => null,
            },
        };

        const userId = await runHandler(
            ensureAccessUser as unknown as HandlerExport,
            ctx,
            {},
        );

        expect(userId).toBe("users:default");
        expect(insert).toHaveBeenCalledTimes(1);
        expect(insert).toHaveBeenCalledWith("users", {
            name: "Default User",
            email: "default@local.agentchat",
            workspaceChatCount: 0,
            workspaceMessageCount: 0,
            createdAt: expect.any(Number),
            updatedAt: expect.any(Number),
        });
        expect(patch).not.toHaveBeenCalled();
    });

    test("resetWorkspaceData bootstraps the default user in disabled mode", async () => {
        process.env.AGENTCHAT_AUTH_MODE = "disabled";

        const insert = mock(async () => "users:default");
        const patch = mock(async () => undefined);
        const ctx = {
            db: {
                query: () => ({
                    withIndex: () => ({
                        unique: async () => null,
                        take: async () => [],
                    }),
                }),
                insert,
                patch,
                get: async () => null,
                delete: async () => undefined,
            },
        };

        await runHandler(
            resetWorkspaceData as unknown as HandlerExport,
            ctx,
            {},
        );

        expect(insert).toHaveBeenCalledTimes(1);
        expect(patch).toHaveBeenCalledTimes(1);
        expect(patch).toHaveBeenCalledWith(
            "users:default",
            expect.objectContaining({
                workspaceChatCount: 0,
                workspaceMessageCount: 0,
            }),
        );
    });
});
