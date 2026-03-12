import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { SupportedParameter } from "@/lib/types";
import {
    fetchAvailableModels,
    fetchBootstrap,
    fetchProviderModels,
    getAgentchatServerUrl,
} from "@/lib/agentchat-server";

describe("agentchat-server", () => {
    const originalUrl = process.env.NEXT_PUBLIC_AGENTCHAT_SERVER_URL;
    const fetchMock = mock(globalThis.fetch);

    beforeEach(() => {
        fetchMock.mockReset();
        globalThis.fetch = fetchMock as unknown as typeof fetch;
    });

    afterEach(() => {
        if (originalUrl === undefined) {
            delete process.env.NEXT_PUBLIC_AGENTCHAT_SERVER_URL;
        } else {
            process.env.NEXT_PUBLIC_AGENTCHAT_SERVER_URL = originalUrl;
        }
    });

    test("trims the configured server url", () => {
        process.env.NEXT_PUBLIC_AGENTCHAT_SERVER_URL =
            "http://localhost:8787///";
        expect(getAgentchatServerUrl()).toBe("http://localhost:8787");
    });

    test("fetches bootstrap payload", async () => {
        process.env.NEXT_PUBLIC_AGENTCHAT_SERVER_URL = "http://localhost:8787";
        fetchMock.mockResolvedValueOnce(
            new Response(
                JSON.stringify({
                    providers: [{ id: "codex-main", enabled: true }],
                    agents: [{ id: "example-agent", name: "Example Agent" }],
                }),
                { status: 200 },
            ),
        );

        const payload = await fetchBootstrap();
        expect(payload.providers[0]?.id).toBe("codex-main");
        expect(payload.agents[0]?.id).toBe("example-agent");
        expect(fetchMock.mock.calls[0]?.[0]).toBe(
            "http://localhost:8787/api/bootstrap",
        );
    });

    test("fetches provider models payload", async () => {
        process.env.NEXT_PUBLIC_AGENTCHAT_SERVER_URL = "http://localhost:8787";
        fetchMock.mockResolvedValueOnce(
            new Response(
                JSON.stringify({
                    providerId: "codex-main",
                    models: [{ id: "gpt-5.3-codex", label: "GPT-5.3 Codex" }],
                }),
                { status: 200 },
            ),
        );

        const payload = await fetchProviderModels("codex-main");
        expect(payload.providerId).toBe("codex-main");
        expect(fetchMock.mock.calls[0]?.[0]).toBe(
            "http://localhost:8787/api/providers/codex-main/models",
        );
    });

    test("flattens provider model catalogs into web model metadata", async () => {
        process.env.NEXT_PUBLIC_AGENTCHAT_SERVER_URL = "http://localhost:8787";
        fetchMock
            .mockResolvedValueOnce(
                new Response(
                    JSON.stringify({
                        providers: [
                            {
                                id: "codex-main",
                                label: "Codex Main",
                                kind: "codex",
                                enabled: true,
                            },
                        ],
                        agents: [],
                    }),
                    { status: 200 },
                ),
            )
            .mockResolvedValueOnce(
                new Response(
                    JSON.stringify({
                        providerId: "codex-main",
                        models: [
                            {
                                id: "gpt-5.3-codex",
                                label: "GPT-5.3 Codex",
                                supportsReasoning: true,
                                variants: [
                                    { id: "fast", label: "Fast" },
                                    { id: "balanced", label: "Balanced" },
                                ],
                            },
                        ],
                    }),
                    { status: 200 },
                ),
            );

        const models = await fetchAvailableModels();
        expect(models).toHaveLength(1);
        expect(models[0]).toMatchObject({
            id: "gpt-5.3-codex",
            name: "GPT-5.3 Codex",
            provider: "Codex Main",
            variants: [
                { id: "fast", label: "Fast" },
                { id: "balanced", label: "Balanced" },
            ],
        });
        expect(models[0]?.supportedParameters).toEqual([
            SupportedParameter.Reasoning,
        ]);
    });
});
