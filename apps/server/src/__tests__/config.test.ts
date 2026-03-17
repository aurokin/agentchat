import { describe, expect, mock, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { ConfigStore, parseConfig } from "../config.ts";
import { createFetchHandler } from "../http.ts";

const exampleConfigPath = path.resolve(
    import.meta.dir,
    "..",
    "..",
    "agentchat.config.example.json",
);
const exampleConfig = parseConfig(
    JSON.parse(readFileSync(exampleConfigPath, "utf8")) as unknown,
);

function createTempConfigPath(): string {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "agentchat-config-"));
    return path.join(tempDir, "agentchat.config.json");
}

function withMutedConfigReloadLogs<T>(run: () => T): T {
    const originalConsoleLog = console.log;
    const originalConsoleError = console.error;
    console.log = mock(() => undefined) as typeof console.log;
    console.error = mock(() => undefined) as typeof console.error;

    try {
        return run();
    } finally {
        console.log = originalConsoleLog;
        console.error = originalConsoleError;
    }
}

describe("server config", () => {
    test("parses the example config", () => {
        expect(exampleConfig.version).toBe(1);
        expect(exampleConfig.providers).toHaveLength(1);
        expect(exampleConfig.agents).toHaveLength(1);
        expect(exampleConfig.agents[0]?.defaultProviderId).toBe("codex-main");
        expect(exampleConfig.providers[0]?.models[0]?.id).toBe("gpt-5.4");
    });

    test("serves bootstrap, provider models, and agent options routes", async () => {
        const fetch = createFetchHandler({
            getConfig: () => exampleConfig,
        });

        const bootstrapResponse = await fetch(
            new Request("http://localhost/api/bootstrap"),
        );
        expect(bootstrapResponse.status).toBe(200);
        const bootstrap = (await bootstrapResponse.json()) as {
            auth: {
                defaultProviderId: string;
                requiresLogin: boolean;
                activeProvider: {
                    id: string;
                    kind: "google" | "local";
                    enabled: boolean;
                    allowlistMode: "email" | null;
                    allowSignup: boolean | null;
                } | null;
                providers: Array<{
                    id: string;
                    kind: "google" | "local";
                    enabled: boolean;
                    allowlistMode: "email" | null;
                    allowSignup: boolean | null;
                }>;
            };
            agents: Array<{ id: string }>;
            providers: Array<{ id: string }>;
        };
        expect(bootstrap.auth).toEqual({
            defaultProviderId: "google-main",
            requiresLogin: true,
            activeProvider: {
                id: "google-main",
                kind: "google",
                enabled: true,
                allowlistMode: "email",
                allowSignup: null,
            },
            providers: [
                {
                    id: "google-main",
                    kind: "google",
                    enabled: true,
                    allowlistMode: "email",
                    allowSignup: null,
                },
            ],
        });
        expect(bootstrap.agents[0]?.id).toBe("example-agent");
        expect(bootstrap.providers[0]?.id).toBe("codex-main");

        const modelsResponse = await fetch(
            new Request("http://localhost/api/providers/codex-main/models"),
        );
        expect(modelsResponse.status).toBe(200);
        const modelsPayload = (await modelsResponse.json()) as {
            providerId: string;
            models: Array<{
                id: string;
                supportsReasoning: boolean;
                variants: Array<{ id: string }>;
            }>;
        };
        expect(modelsPayload.providerId).toBe("codex-main");
        expect(modelsPayload.models[0]?.id).toBe("gpt-5.4");
        expect(modelsPayload.models[0]?.supportsReasoning).toBe(true);
        expect(
            modelsPayload.models[0]?.variants.map((item) => item.id),
        ).toEqual(["low", "medium", "high", "xhigh"]);

        const optionsResponse = await fetch(
            new Request("http://localhost/api/agents/example-agent/options"),
        );
        expect(optionsResponse.status).toBe(200);
        const options = (await optionsResponse.json()) as {
            agentId: string;
            defaultProviderId: string;
        };
        expect(options.agentId).toBe("example-agent");
        expect(options.defaultProviderId).toBe("codex-main");
    });

    test("parses provider-oriented auth config without rewriting it", () => {
        const config = parseConfig({
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
            providers: exampleConfig.providers,
            agents: exampleConfig.agents,
        });

        expect(config.auth).toEqual({
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
        });
    });

    test("parses local auth config", () => {
        const config = parseConfig({
            version: 1,
            auth: {
                defaultProviderId: "local-main",
                providers: [
                    {
                        id: "local-main",
                        kind: "local",
                        enabled: true,
                        allowSignup: false,
                    },
                ],
            },
            providers: exampleConfig.providers,
            agents: exampleConfig.agents,
        });

        expect(config.auth).toEqual({
            defaultProviderId: "local-main",
            providers: [
                {
                    id: "local-main",
                    kind: "local",
                    enabled: true,
                    allowSignup: false,
                },
            ],
        });
    });

    test("keeps the last known good config when reloads fail and recovers cleanly", () => {
        withMutedConfigReloadLogs(() => {
            const configPath = createTempConfigPath();

            try {
                writeFileSync(
                    configPath,
                    `${JSON.stringify(exampleConfig, null, 2)}\n`,
                    "utf8",
                );

                const store = new ConfigStore(configPath);
                const initialLoadedAt = store.status.loadedAt;

                const updatedConfig = structuredClone(exampleConfig);
                updatedConfig.agents[0]!.name = "Reloaded Agent";
                writeFileSync(
                    configPath,
                    `${JSON.stringify(updatedConfig, null, 2)}\n`,
                    "utf8",
                );

                store.reloadNow(1_111);

                expect(store.snapshot.agents[0]?.name).toBe("Reloaded Agent");
                expect(store.status).toEqual({
                    loadedAt: 1_111,
                    lastReloadAttemptAt: 1_111,
                    lastReloadError: null,
                });

                writeFileSync(configPath, "{\n", "utf8");

                store.reloadNow(2_222);

                expect(store.snapshot.agents[0]?.name).toBe("Reloaded Agent");
                expect(store.status.loadedAt).toBe(1_111);
                expect(store.status.lastReloadAttemptAt).toBe(2_222);
                expect(store.status.lastReloadError).toBeString();
                expect(store.status.lastReloadError).not.toBeNull();

                const recoveredConfig = structuredClone(exampleConfig);
                recoveredConfig.agents[0]!.name = "Recovered Agent";
                writeFileSync(
                    configPath,
                    `${JSON.stringify(recoveredConfig, null, 2)}\n`,
                    "utf8",
                );

                store.reloadNow(3_333);

                expect(store.snapshot.agents[0]?.name).toBe("Recovered Agent");
                expect(store.status).toEqual({
                    loadedAt: 3_333,
                    lastReloadAttemptAt: 3_333,
                    lastReloadError: null,
                });
                expect(initialLoadedAt).not.toBe(1_111);
            } finally {
                rmSync(path.dirname(configPath), {
                    recursive: true,
                    force: true,
                });
            }
        });
    });
});
