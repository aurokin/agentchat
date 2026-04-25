import { describe, expect, mock, test } from "bun:test";

import { CodexModelCatalog } from "../codexModelCatalog.ts";
import type { AgentchatConfig } from "../config.ts";

function createConfig(): AgentchatConfig {
    return {
        version: 1,
        instanceKey: "instance-test",
        sandboxRoot: "/tmp/agentchat-sandboxes",
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

function createV2Config(): AgentchatConfig {
    const config = createConfig();
    const provider = config.providers[0]!;
    config.providers = [];
    config.agents = [
        {
            id: "agent-main",
            name: "Main Agent",
            enabled: true,
            defaultVisible: true,
            visibilityOverrides: [],
            rootPath: "/srv/codex",
            providerIds: [provider.id],
            defaultProviderId: provider.id,
            runtime: {
                id: provider.id,
                kind: provider.kind,
                label: provider.label,
                enabled: provider.enabled,
                idleTtlSeconds: provider.idleTtlSeconds,
                modelCacheTtlSeconds: provider.modelCacheTtlSeconds,
                models: provider.models,
                command: provider.codex.command,
                args: provider.codex.args,
                baseEnv: provider.codex.baseEnv,
                cwd: provider.codex.cwd,
            },
            modelAllowlist: [],
            variantAllowlist: [],
            tags: [],
            sortOrder: 0,
            workspaceMode: "shared",
        },
    ];
    return config;
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
                    defaultReasoningEffort: "medium",
                },
            ],
            nextCursor: null,
        }));
        const stop = mock(async () => undefined);

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
                    defaultVariantId: "medium",
                    providerMetadata: {
                        defaultReasoningEffort: "medium",
                    },
                },
            ],
        });
    });

    test("passes through GPT-5.4 mini, GPT-5.5, and unknown live model ids", async () => {
        const request = mock(async () => ({
            data: [
                {
                    id: "gpt-5.4-mini",
                    displayName: "GPT-5.4 Mini",
                    hidden: false,
                },
                {
                    id: "gpt-5.5",
                    displayName: "GPT-5.5",
                    hidden: false,
                },
                {
                    id: "future-model-2026-04-25",
                    hidden: false,
                },
            ],
            nextCursor: null,
        }));

        const catalog = new CodexModelCatalog({
            getConfig: () => createConfig(),
            createClient: () => ({
                initialize: async () => undefined,
                request,
                onNotification: () => undefined,
                onExit: () => undefined,
                stop: async () => undefined,
            }),
        });

        const result = await catalog.getProviderModels("codex-main");

        expect(result?.models.map((model) => model.id)).toEqual([
            "gpt-5.4-mini",
            "gpt-5.5",
            "future-model-2026-04-25",
        ]);
        expect(result?.models).toContainEqual(
            expect.objectContaining({
                id: "future-model-2026-04-25",
                label: "future-model-2026-04-25",
            }),
        );
    });

    test("fetches model metadata from v2 agent runtime providers", async () => {
        const request = mock(async () => ({
            data: [
                {
                    id: "gpt-5.4",
                    displayName: "GPT-5.4",
                    hidden: false,
                },
            ],
            nextCursor: null,
        }));

        const catalog = new CodexModelCatalog({
            getConfig: () => createV2Config(),
            createClient: () => ({
                initialize: async () => undefined,
                request,
                onNotification: () => undefined,
                onExit: () => undefined,
                stop: async () => undefined,
            }),
        });

        const result = await catalog.getProviderModels("codex-main");

        expect(result).toMatchObject({
            providerId: "codex-main",
            models: [{ id: "gpt-5.4", label: "GPT-5.4" }],
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
                stop: async () => undefined,
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

    test("scopes the in-memory cache to provider runtime configuration", async () => {
        let config = createConfig();
        let requestCount = 0;
        const request = mock(async () => {
            requestCount += 1;
            return {
                data: [
                    {
                        id: `live-model-${requestCount}`,
                        displayName: `Live Model ${requestCount}`,
                        hidden: false,
                        supportedReasoningEfforts: [],
                    },
                ],
                nextCursor: null,
            };
        });

        const catalog = new CodexModelCatalog({
            getConfig: () => config,
            now: () => Date.UTC(2026, 2, 13, 12, 0, 0),
            createClient: () => ({
                initialize: async () => undefined,
                request,
                onNotification: () => undefined,
                onExit: () => undefined,
                stop: async () => undefined,
            }),
        });

        await expect(
            catalog.getProviderModels("codex-main"),
        ).resolves.toMatchObject({
            models: [{ id: "live-model-1" }],
        });
        await expect(
            catalog.getProviderModels("codex-main"),
        ).resolves.toMatchObject({
            models: [{ id: "live-model-1" }],
        });

        config = createConfig();
        config.providers[0]!.codex.command = "codex-next";

        await expect(
            catalog.getProviderModels("codex-main"),
        ).resolves.toMatchObject({
            models: [{ id: "live-model-2" }],
        });
        expect(request).toHaveBeenCalledTimes(2);
    });

    test("scopes v2 agent runtime model cache to inline runtime configuration", async () => {
        let config = createV2Config();
        let requestCount = 0;
        const request = mock(async () => {
            requestCount += 1;
            return {
                data: [
                    {
                        id: `agent-runtime-model-${requestCount}`,
                        displayName: `Agent Runtime Model ${requestCount}`,
                        hidden: false,
                        supportedReasoningEfforts: [],
                    },
                ],
                nextCursor: null,
            };
        });

        const catalog = new CodexModelCatalog({
            getConfig: () => config,
            now: () => Date.UTC(2026, 2, 13, 12, 0, 0),
            createClient: () => ({
                initialize: async () => undefined,
                request,
                onNotification: () => undefined,
                onExit: () => undefined,
                stop: async () => undefined,
            }),
        });

        await expect(
            catalog.getProviderModels("codex-main"),
        ).resolves.toMatchObject({
            models: [{ id: "agent-runtime-model-1" }],
        });

        config = createV2Config();
        config.agents[0]!.runtime!.cwd = "/srv/codex-next";

        await expect(
            catalog.getProviderModels("codex-main"),
        ).resolves.toMatchObject({
            models: [{ id: "agent-runtime-model-2" }],
        });
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
                    stop: async () => undefined,
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
                    stop: async () => undefined,
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
                            defaultReasoningEffort: "medium",
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
                stop: async () => undefined,
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
                defaultVariantId: null,
                providerMetadata: {
                    defaultReasoningEffort: "medium",
                },
            },
            {
                id: "gpt-5.4-codex-spark",
                label: "gpt-5.4-codex-spark",
                supportsReasoning: false,
                variants: [],
                defaultVariantId: null,
                providerMetadata: {},
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
                stop: async () => undefined,
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
                stop: async () => undefined,
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
                stop: async () => undefined,
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
