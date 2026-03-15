import { describe, expect, mock, test } from "bun:test";

import { runtimeBinding } from "../runtimeIngress";

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
});
