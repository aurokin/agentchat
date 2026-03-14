import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

import { RuntimePersistenceClient } from "../runtimePersistence.ts";

describe("RuntimePersistenceClient", () => {
    const originalFetch = globalThis.fetch;
    const originalSiteUrl = process.env.AGENTCHAT_CONVEX_SITE_URL;
    const originalSecret = process.env.RUNTIME_INGRESS_SECRET;

    beforeEach(() => {
        process.env.AGENTCHAT_CONVEX_SITE_URL =
            "https://agentchat.convex.site/";
        process.env.RUNTIME_INGRESS_SECRET = "runtime-secret";
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;

        if (originalSiteUrl === undefined) {
            delete process.env.AGENTCHAT_CONVEX_SITE_URL;
        } else {
            process.env.AGENTCHAT_CONVEX_SITE_URL = originalSiteUrl;
        }

        if (originalSecret === undefined) {
            delete process.env.RUNTIME_INGRESS_SECRET;
        } else {
            process.env.RUNTIME_INGRESS_SECRET = originalSecret;
        }
    });

    test.each([
        ["/runtime/message-started", "messageStarted"],
        ["/runtime/message-delta", "messageDelta"],
        ["/runtime/run-completed", "runCompleted"],
        ["/runtime/run-interrupted", "runInterrupted"],
        ["/runtime/run-failed", "runFailed"],
        ["/runtime/run-stale", "recoverStaleRun"],
        ["/runtime/runtime-binding", "runtimeBinding"],
    ] as const)("posts %s for %s writes", async (expectedPath, methodName) => {
        const fetchMock = mock(async () => new Response(null, { status: 200 }));
        globalThis.fetch = fetchMock as unknown as typeof fetch;

        const client = new RuntimePersistenceClient();
        await client[methodName]({
            conversationLocalId: "chat-1",
            userId: "user-1",
        });

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const fetchCalls = fetchMock.mock.calls as unknown as Array<
            [string | URL, RequestInit?]
        >;
        expect(fetchCalls[0]?.[0]).toBe(
            `https://agentchat.convex.site${expectedPath}`,
        );
    });

    test("posts runtime updates with the expected headers and trimmed base url", async () => {
        const fetchMock = mock(
            async (url: string | URL, init?: RequestInit) => {
                return new Response(null, { status: 200 });
            },
        );
        globalThis.fetch = fetchMock as unknown as typeof fetch;

        const client = new RuntimePersistenceClient();
        await client.runStarted({
            conversationLocalId: "chat-1",
            userId: "user-1",
        });

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const fetchCalls = fetchMock.mock.calls as unknown as Array<
            [string | URL, RequestInit?]
        >;
        const [url, init] = fetchCalls[0] ?? [];
        expect(url).toBe("https://agentchat.convex.site/runtime/run-started");
        expect(init).toMatchObject({
            method: "POST",
            headers: {
                "content-type": "application/json",
                "x-agentchat-runtime-secret": "runtime-secret",
            },
        });
        expect(init?.body).toBe(
            JSON.stringify({
                conversationLocalId: "chat-1",
                userId: "user-1",
            }),
        );
    });

    test("returns parsed runtime binding payloads", async () => {
        const fetchMock = mock(async () => {
            return Response.json({
                provider: "codex-main",
                status: "active",
                providerThreadId: "thread-1",
                providerResumeToken: null,
                activeRunId: "run-1",
                lastError: null,
                lastEventAt: 1,
                expiresAt: null,
                updatedAt: 2,
            });
        });
        globalThis.fetch = fetchMock as unknown as typeof fetch;

        const client = new RuntimePersistenceClient();
        const result = await client.readRuntimeBinding({
            userId: "user-1",
            conversationLocalId: "chat-1",
        });

        expect(result).toMatchObject({
            provider: "codex-main",
            activeRunId: "run-1",
        });
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    test("returns null runtime binding payloads without throwing", async () => {
        const fetchMock = mock(async () => Response.json(null));
        globalThis.fetch = fetchMock as unknown as typeof fetch;

        const client = new RuntimePersistenceClient();
        const result = await client.readRuntimeBinding({
            userId: "user-1",
            conversationLocalId: "chat-1",
        });

        expect(result).toBeNull();
    });

    test("surfaces non-200 ingress responses", async () => {
        const fetchMock = mock(async () => {
            return new Response("bad request", { status: 400 });
        });
        globalThis.fetch = fetchMock as unknown as typeof fetch;

        const client = new RuntimePersistenceClient();

        await expect(
            client.runCompleted({
                conversationLocalId: "chat-1",
                userId: "user-1",
            }),
        ).rejects.toThrow(
            "Runtime persistence request failed (400) for /runtime/run-completed: bad request",
        );
    });

    test("fails fast when runtime env is missing", async () => {
        delete process.env.AGENTCHAT_CONVEX_SITE_URL;

        expect(() => new RuntimePersistenceClient()).toThrow(
            "AGENTCHAT_CONVEX_SITE_URL is not configured.",
        );
    });
});
