import { describe, expect, mock, test } from "bun:test";
import {
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    symlinkSync,
    writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

import { ConfigStore, loadConfigFile, parseConfig } from "../config.ts";
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

    test("keeps the default state id stable across checkout relocations", () => {
        const releaseADir = mkdtempSync(path.join(os.tmpdir(), "release-a-"));
        const releaseBDir = mkdtempSync(path.join(os.tmpdir(), "release-b-"));
        const releaseAPath = path.join(releaseADir, "agentchat.config.json");
        const releaseBPath = path.join(releaseBDir, "agentchat.config.json");
        const releaseAConfig = JSON.parse(
            readFileSync(exampleConfigPath, "utf8"),
        ) as Record<string, unknown>;
        const releaseBConfig = JSON.parse(
            readFileSync(exampleConfigPath, "utf8"),
        ) as Record<string, unknown>;

        const releaseAAgents = (
            releaseAConfig.agents as Array<Record<string, unknown>>
        ).map((agent) => ({
            ...agent,
            rootPath: "/srv/releases/a/agent-root",
        }));
        const releaseBAgents = (
            releaseBConfig.agents as Array<Record<string, unknown>>
        ).map((agent) => ({
            ...agent,
            rootPath: "/srv/releases/b/agent-root",
        }));
        const releaseAProviders = (
            releaseAConfig.providers as Array<Record<string, unknown>>
        ).map((provider) => ({
            ...provider,
            codex: {
                ...(provider.codex as Record<string, unknown>),
                cwd: "/srv/releases/a",
            },
        }));
        const releaseBProviders = (
            releaseBConfig.providers as Array<Record<string, unknown>>
        ).map((provider) => ({
            ...provider,
            codex: {
                ...(provider.codex as Record<string, unknown>),
                cwd: "/srv/releases/b",
            },
        }));

        try {
            writeFileSync(
                releaseAPath,
                JSON.stringify({
                    ...releaseAConfig,
                    agents: releaseAAgents,
                    providers: releaseAProviders,
                }),
            );
            writeFileSync(
                releaseBPath,
                JSON.stringify({
                    ...releaseBConfig,
                    agents: releaseBAgents,
                    providers: releaseBProviders,
                }),
            );

            expect(loadConfigFile(releaseAPath).stateId).toBe(
                loadConfigFile(releaseBPath).stateId,
            );
            expect(loadConfigFile(releaseAPath).instanceKey).not.toBe(
                loadConfigFile(releaseBPath).instanceKey,
            );
        } finally {
            rmSync(releaseADir, { recursive: true, force: true });
            rmSync(releaseBDir, { recursive: true, force: true });
        }
    });

    test("separates default state ids for installs with different config identities", () => {
        const baseConfig = JSON.parse(
            readFileSync(exampleConfigPath, "utf8"),
        ) as Record<string, unknown>;
        const stagingConfig = {
            ...baseConfig,
            auth: {
                ...(baseConfig.auth as Record<string, unknown>),
                defaultProviderId: "google-staging",
                providers: [
                    {
                        id: "google-staging",
                        kind: "google",
                        enabled: true,
                        allowlistMode: "email",
                        allowedEmails: [],
                        allowedDomains: [],
                        googleHostedDomain: null,
                    },
                ],
            },
        };
        const productionConfig = {
            ...baseConfig,
            auth: {
                ...(baseConfig.auth as Record<string, unknown>),
                defaultProviderId: "google-prod",
                providers: [
                    {
                        id: "google-prod",
                        kind: "google",
                        enabled: true,
                        allowlistMode: "email",
                        allowedEmails: [],
                        allowedDomains: [],
                        googleHostedDomain: null,
                    },
                ],
            },
        };

        expect(parseConfig(stagingConfig).stateId).not.toBe(
            parseConfig(productionConfig).stateId,
        );
    });

    test("keeps the default state id stable across sandboxRoot migrations", () => {
        const baseConfig = JSON.parse(
            readFileSync(exampleConfigPath, "utf8"),
        ) as Record<string, unknown>;
        const oldRootConfig = {
            ...baseConfig,
            sandboxRoot: "/srv/agentchat/old-sandboxes",
        };
        const newRootConfig = {
            ...baseConfig,
            sandboxRoot: "/srv/agentchat/new-sandboxes",
        };

        expect(parseConfig(oldRootConfig).stateId).toBe(
            parseConfig(newRootConfig).stateId,
        );
        expect(parseConfig(oldRootConfig).instanceKey).not.toBe(
            parseConfig(newRootConfig).instanceKey,
        );
    });

    test("preserves an explicit state id from config", () => {
        const parsed = parseConfig({
            version: 1,
            stateId: "prod-self-host",
            auth: exampleConfig.auth,
            providers: exampleConfig.providers,
            agents: exampleConfig.agents,
        });

        expect(parsed.stateId).toBe("prod-self-host");
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

    test("defaults sandboxRoot to ~/.agentchat/sandboxes when not specified", () => {
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

        expect(config.sandboxRoot).toBe(
            path.join(os.homedir(), ".agentchat", "sandboxes"),
        );
    });

    test("uses explicit sandboxRoot when specified", () => {
        const config = parseConfig({
            version: 1,
            sandboxRoot: "/custom/sandbox/path",
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

        expect(config.sandboxRoot).toBe("/custom/sandbox/path");
    });

    test("defaults workspaceMode to shared when not specified", () => {
        expect(exampleConfig.agents[0]?.workspaceMode).toBe("shared");
    });

    test("allows unsafe legacy agent ids in shared mode", () => {
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
            agents: [
                {
                    ...exampleConfig.agents[0],
                    id: "team/frontend",
                    workspaceMode: "shared",
                },
            ],
        });

        expect(config.agents[0]?.id).toBe("team/frontend");
    });

    test("rejects unsafe agent ids for copy-on-conversation workspaces", () => {
        expect(() =>
            parseConfig({
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
                agents: [
                    {
                        ...exampleConfig.agents[0],
                        id: "team/frontend",
                        workspaceMode: "copy-on-conversation",
                    },
                ],
            }),
        ).toThrow(/safe filesystem path segment/);
    });

    test("rejects agent ids with Windows-reserved names or characters", () => {
        expect(() =>
            parseConfig({
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
                agents: [
                    {
                        ...exampleConfig.agents[0],
                        id: "frontend:api",
                        workspaceMode: "copy-on-conversation",
                    },
                ],
            }),
        ).toThrow(/safe filesystem path segment/);

        expect(() =>
            parseConfig({
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
                agents: [
                    {
                        ...exampleConfig.agents[0],
                        id: "CON",
                        workspaceMode: "copy-on-conversation",
                    },
                ],
            }),
        ).toThrow(/safe filesystem path segment/);
    });

    test("rejects config where sandboxRoot overlaps an agent rootPath for copy-on-conversation", () => {
        expect(() =>
            parseConfig({
                version: 1,
                sandboxRoot: "/projects/my-app/sandboxes",
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
                agents: [
                    {
                        ...exampleConfig.agents[0],
                        rootPath: "/projects/my-app",
                        workspaceMode: "copy-on-conversation",
                    },
                ],
            }),
        ).toThrow(/overlaps with sandboxRoot/);
    });

    test("rejects config where sandboxRoot overlaps a shared-mode agent rootPath", () => {
        expect(() =>
            parseConfig({
                version: 1,
                sandboxRoot: "/projects/my-app/sandboxes",
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
                agents: [
                    {
                        ...exampleConfig.agents[0],
                        rootPath: "/projects/my-app",
                        workspaceMode: "shared",
                    },
                ],
            }),
        ).toThrow(/overlaps with sandboxRoot/);
    });

    test("rejects agent rootPath overlapping the implicit default sandboxRoot", () => {
        // Agent rooted at ~/.agentchat contains the default sandboxRoot (~/.agentchat/sandboxes)
        expect(() =>
            parseConfig({
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
                agents: [
                    {
                        ...exampleConfig.agents[0],
                        rootPath: path.join(os.homedir(), ".agentchat"),
                        workspaceMode: "copy-on-conversation",
                    },
                ],
            }),
        ).toThrow(/overlaps with sandboxRoot/);
    });

    test("rejects sandboxRoot overlaps through symlinked path aliases", () => {
        const tempDir = mkdtempSync(
            path.join(os.tmpdir(), "agentchat-config-symlink-"),
        );
        const repoRoot = path.join(tempDir, "repo");
        const aliasParent = path.join(tempDir, "aliases");
        const sandboxAlias = path.join(aliasParent, "sandboxes");
        mkdirSync(path.join(repoRoot, "sandboxes"), { recursive: true });
        mkdirSync(aliasParent, { recursive: true });
        symlinkSync(path.join(repoRoot, "sandboxes"), sandboxAlias);

        expect(() =>
            parseConfig({
                version: 1,
                sandboxRoot: sandboxAlias,
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
                agents: [
                    {
                        ...exampleConfig.agents[0],
                        rootPath: repoRoot,
                        workspaceMode: "copy-on-conversation",
                    },
                ],
            }),
        ).toThrow(/overlaps with sandboxRoot/);

        rmSync(tempDir, { recursive: true, force: true });
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
