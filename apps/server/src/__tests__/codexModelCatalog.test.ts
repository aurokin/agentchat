import { describe, expect, mock, test } from "bun:test";

import { CodexModelCatalog } from "../codexModelCatalog.ts";
import type { AgentchatConfig } from "../config.ts";

function createConfig(): AgentchatConfig {
    return {
        version: 1,
        auth: {
            allowlistMode: "email",
            allowedEmails: ["operator@example.com"],
            allowedDomains: [],
            googleHostedDomain: null,
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
                                id: "balanced",
                                label: "Balanced",
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
                        { id: "fast", label: "Fast" },
                        { id: "balanced", label: "Balanced" },
                        { id: "deep", label: "Deep" },
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
                        variants: [{ id: "balanced", label: "Balanced" }],
                    },
                ],
            });
        } finally {
            console.error = originalConsoleError;
        }
    });
});
