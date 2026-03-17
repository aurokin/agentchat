import { describe, expect, mock, test } from "bun:test";

import { CodexModelCatalog } from "../codexModelCatalog.ts";
import type { AgentchatConfig } from "../config.ts";

function createConfig(): AgentchatConfig {
    return {
        version: 1,
        auth: {
            defaultProviderId: "google-main",
            providers: [
                {
                    id: "google-main",
                    kind: "google",
                    enabled: true,
                    allowlistMode: "email",
                    allowedEmails: ["operator@example.com"],
                    allowedDomains: [],
                    googleHostedDomain: null,
                },
            ],
        },
        providers: [
            {
                id: "codex-main",
                kind: "codex",
                label: "Codex Main",
                enabled: true,
                idleTtlSeconds: 900,
                modelCacheTtlSeconds: 60,
                models: [
                    {
                        id: "fallback-model",
                        label: "Fallback Model",
                        enabled: true,
                        supportsReasoning: true,
                        variants: [
                            {
                                id: "medium",
                                label: "Medium",
                                enabled: true,
                            },
                        ],
                    },
                ],
                codex: {
                    command: "codex",
                    args: ["app-server"],
                    baseEnv: {},
                    cwd: "/srv/codex",
                },
            },
        ],
        agents: [],
    };
}

describe("CodexModelCatalog", () => {
    test("fetches live model metadata and normalizes reasoning efforts", async () => {
        const initialize = mock(async () => undefined);
        const request = mock(async () => ({
            data: [
                {
                    id: "gpt-5.3-codex",
                    displayName: "GPT-5.3 Codex",
                    hidden: false,
                    supportedReasoningEfforts: [
                        { reasoningEffort: "low" },
                        { reasoningEffort: "medium" },
                        { reasoningEffort: "high" },
                    ],
                },
            ],
            nextCursor: null,
        }));
        const stop = mock(() => undefined);

        const catalog = new CodexModelCatalog({
            getConfig: () => createConfig(),
            now: () => Date.UTC(2026, 2, 13, 12, 0, 0),
            createClient: () => ({
                initialize,
                request,
                onNotification: () => undefined,
                onExit: () => undefined,
                stop,
            }),
        });

        const result = await catalog.getProviderModels("codex-main");

        expect(initialize).toHaveBeenCalledTimes(1);
        expect(request).toHaveBeenCalledWith("model/list", {
            limit: 100,
            cursor: null,
            includeHidden: false,
        });
        expect(stop).toHaveBeenCalledTimes(1);
        expect(result).toMatchObject({
            providerId: "codex-main",
            fetchedAt: "2026-03-13T12:00:00.000Z",
            expiresAt: "2026-03-13T12:01:00.000Z",
            models: [
                {
                    id: "gpt-5.3-codex",
                    label: "GPT-5.3 Codex",
                    supportsReasoning: true,
                    variants: [
                        { id: "low", label: "Low" },
                        { id: "medium", label: "Medium" },
                        { id: "high", label: "High" },
                    ],
                },
            ],
        });
    });

    test("uses the in-memory cache until ttl expiry", async () => {
        let now = Date.UTC(2026, 2, 13, 12, 0, 0);
        const request = mock(async () => ({
            data: [
                {
                    id: "gpt-5.3-codex",
                    displayName: "GPT-5.3 Codex",
                    hidden: false,
                    supportedReasoningEfforts: [],
                },
            ],
            nextCursor: null,
        }));

        const catalog = new CodexModelCatalog({
            getConfig: () => createConfig(),
            now: () => now,
            createClient: () => ({
                initialize: async () => undefined,
                request,
                onNotification: () => undefined,
                onExit: () => undefined,
                stop: () => undefined,
            }),
        });

        await catalog.getProviderModels("codex-main");
        now += 30_000;
        await catalog.getProviderModels("codex-main");

        expect(request).toHaveBeenCalledTimes(1);

        now += 31_000;
        await catalog.getProviderModels("codex-main");

        expect(request).toHaveBeenCalledTimes(2);
    });

    test("falls back to config models when live fetch fails", async () => {
        const consoleError = mock(() => undefined);
        const originalConsoleError = console.error;
        console.error = consoleError as typeof console.error;

        try {
            const catalog = new CodexModelCatalog({
                getConfig: () => createConfig(),
                createClient: () => ({
                    initialize: async () => undefined,
                    request: async () => {
                        throw new Error("model/list failed");
                    },
                    onNotification: () => undefined,
                    onExit: () => undefined,
                    stop: () => undefined,
                }),
            });

            const result = await catalog.getProviderModels("codex-main");

            expect(result).toMatchObject({
                providerId: "codex-main",
                fetchedAt: null,
                expiresAt: null,
                models: [
                    {
                        id: "fallback-model",
                        label: "Fallback Model",
                        variants: [{ id: "medium", label: "Medium" }],
                    },
                ],
            });
        } finally {
            console.error = originalConsoleError;
        }
    });

    test("falls back to config models when live discovery returns no visible models", async () => {
        const consoleError = mock(() => undefined);
        const originalConsoleError = console.error;
        console.error = consoleError as typeof console.error;

        try {
            const catalog = new CodexModelCatalog({
                getConfig: () => createConfig(),
                createClient: () => ({
                    initialize: async () => undefined,
                    request: async () => ({
                        data: [
                            {
                                id: "hidden-model",
                                displayName: "Hidden",
                                hidden: true,
                                supportedReasoningEfforts: [],
                            },
                        ],
                        nextCursor: null,
                    }),
                    onNotification: () => undefined,
                    onExit: () => undefined,
                    stop: () => undefined,
                }),
            });

            const result = await catalog.getProviderModels("codex-main");

            expect(result).toMatchObject({
                providerId: "codex-main",
                fetchedAt: null,
                expiresAt: null,
                models: [
                    {
                        id: "fallback-model",
                        label: "Fallback Model",
                        variants: [{ id: "medium", label: "Medium" }],
                    },
                ],
            });
        } finally {
            console.error = originalConsoleError;
        }
    });

    test("fetches every model/list page and normalizes variants once per model", async () => {
        const request = mock(async (_method: string, params: unknown) => {
            const cursor =
                (params as { cursor?: string | null }).cursor ?? null;
            if (cursor === null) {
                return {
                    data: [
                        {
                            id: "gpt-5.4-codex",
                            displayName: "GPT-5.4 Codex",
                            hidden: false,
                            supportedReasoningEfforts: [
                                { reasoningEffort: "low" },
                                { reasoningEffort: "none" },
                                { reasoningEffort: "xhigh" },
                                { reasoningEffort: "xhigh" },
                            ],
                        },
                    ],
                    nextCursor: "page-2",
                };
            }

            return {
                data: [
                    {
                        id: "gpt-5.4-codex-spark",
                        hidden: false,
                        supportedReasoningEfforts: [],
                    },
                    {
                        id: "hidden-model",
                        displayName: "Hidden Model",
                        hidden: true,
                        supportedReasoningEfforts: [
                            { reasoningEffort: "high" },
                        ],
                    },
                ],
                nextCursor: null,
            };
        });

        const catalog = new CodexModelCatalog({
            getConfig: () => createConfig(),
            createClient: () => ({
                initialize: async () => undefined,
                request,
                onNotification: () => undefined,
                onExit: () => undefined,
                stop: () => undefined,
            }),
        });

        const result = await catalog.getProviderModels("codex-main");

        expect(request).toHaveBeenNthCalledWith(1, "model/list", {
            limit: 100,
            cursor: null,
            includeHidden: false,
        });
        expect(request).toHaveBeenNthCalledWith(2, "model/list", {
            limit: 100,
            cursor: "page-2",
            includeHidden: false,
        });
        expect(result?.models).toEqual([
            {
                id: "gpt-5.4-codex",
                label: "GPT-5.4 Codex",
                supportsReasoning: true,
                variants: [
                    { id: "low", label: "Low" },
                    { id: "xhigh", label: "X-High" },
                ],
            },
            {
                id: "gpt-5.4-codex-spark",
                label: "gpt-5.4-codex-spark",
                supportsReasoning: false,
                variants: [],
            },
        ]);
    });

    test("reports provider probe success with live model count", async () => {
        const catalog = new CodexModelCatalog({
            getConfig: () => createConfig(),
            createClient: () => ({
                initialize: async () => undefined,
                request: async () => ({
                    data: [
                        {
                            id: "gpt-5.3-codex",
                            displayName: "GPT-5.3 Codex",
                            hidden: false,
                            supportedReasoningEfforts: [],
                        },
                    ],
                    nextCursor: null,
                }),
                onNotification: () => undefined,
                onExit: () => undefined,
                stop: () => undefined,
            }),
        });

        await expect(
            catalog.probeProviderModels("codex-main"),
        ).resolves.toEqual({
            providerId: "codex-main",
            ok: true,
            modelCount: 1,
            error: null,
        });
    });

    test("reports provider probe failure when live Codex is unreachable", async () => {
        const catalog = new CodexModelCatalog({
            getConfig: () => createConfig(),
            createClient: () => ({
                initialize: async () => undefined,
                request: async () => {
                    throw new Error("connection refused");
                },
                onNotification: () => undefined,
                onExit: () => undefined,
                stop: () => undefined,
            }),
        });

        await expect(
            catalog.probeProviderModels("codex-main"),
        ).resolves.toEqual({
            providerId: "codex-main",
            ok: false,
            modelCount: 0,
            error: "connection refused",
        });
    });

    test("reports provider probe failure when live discovery returns no visible models", async () => {
        const catalog = new CodexModelCatalog({
            getConfig: () => createConfig(),
            createClient: () => ({
                initialize: async () => undefined,
                request: async () => ({
                    data: [],
                    nextCursor: null,
                }),
                onNotification: () => undefined,
                onExit: () => undefined,
                stop: () => undefined,
            }),
        });

        await expect(
            catalog.probeProviderModels("codex-main"),
        ).resolves.toEqual({
            providerId: "codex-main",
            ok: false,
            modelCount: 0,
            error: "Codex model catalog returned no visible models.",
        });
    });
});
