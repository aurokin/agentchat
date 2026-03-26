import { describe, expect, test } from "bun:test";

import {
    buildConfig,
    mergePreservedConfig,
    tryParseExistingConfig,
} from "../write-test-agent-config";

describe("write-test-agent-config", () => {
    test("marks generated fixture agents as smoke-user-only", () => {
        const generatedConfig = buildConfig(
            "/home/tester",
            "local",
            "tester@example.com",
        );

        expect(
            generatedConfig.agents.filter((agent) =>
                agent.id.startsWith("agentchat-"),
            ),
        ).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    id: "agentchat-smoke",
                    defaultVisible: false,
                    visibilityOverrides: ["smoke_1", "smoke_2"],
                }),
                expect.objectContaining({
                    id: "agentchat-test",
                    defaultVisible: false,
                    visibilityOverrides: ["smoke_1", "smoke_2"],
                }),
                expect.objectContaining({
                    id: "agentchat-workspace",
                    defaultVisible: false,
                    visibilityOverrides: ["smoke_1", "smoke_2"],
                }),
            ]),
        );
    });

    test("keeps generated fixture agents visible for google auth", () => {
        const generatedConfig = buildConfig(
            "/home/tester",
            "google",
            "tester@example.com",
        );

        expect(
            generatedConfig.agents.filter((agent) =>
                agent.id.startsWith("agentchat-"),
            ),
        ).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    id: "agentchat-smoke",
                    defaultVisible: true,
                    visibilityOverrides: [],
                }),
                expect.objectContaining({
                    id: "agentchat-test",
                    defaultVisible: true,
                    visibilityOverrides: [],
                }),
                expect.objectContaining({
                    id: "agentchat-workspace",
                    defaultVisible: true,
                    visibilityOverrides: [],
                }),
            ]),
        );
    });

    test("preserves custom agents and their providers when regenerating", () => {
        const generatedConfig = buildConfig(
            "/home/tester",
            "local",
            "tester@example.com",
        );
        const existingConfig = {
            ...generatedConfig,
            stateId: "custom-state",
            sandboxRoot: "/tmp/custom-sandboxes",
            providers: [
                ...generatedConfig.providers,
                {
                    id: "codex-notes",
                    kind: "codex" as const,
                    label: "Codex Notes",
                    enabled: true,
                    idleTtlSeconds: 900,
                    modelCacheTtlSeconds: 300,
                    models: generatedConfig.providers[0]!.models,
                    codex: {
                        command: "codex",
                        args: ["app-server"],
                        baseEnv: {},
                        cwd: "/home/tester/notes",
                    },
                },
            ],
            agents: [
                ...generatedConfig.agents,
                {
                    id: "dilbert",
                    name: "Dilbert",
                    description: "Private notes agent.",
                    avatar: null,
                    enabled: true,
                    defaultVisible: false,
                    visibilityOverrides: ["auro"],
                    rootPath: "/home/tester/notes",
                    providerIds: ["codex-notes"],
                    defaultProviderId: "codex-notes",
                    defaultModel: "gpt-5.4",
                    defaultVariant: "high",
                    modelAllowlist: [],
                    variantAllowlist: [],
                    tags: ["notes"],
                    sortOrder: 50,
                    workspaceMode: "shared" as const,
                },
            ],
        };

        const merged = mergePreservedConfig({
            generatedConfig,
            existingConfig,
        });

        expect(merged.stateId).toBe("custom-state");
        expect(merged.sandboxRoot).toBe("/tmp/custom-sandboxes");
        expect(merged.providers.map((provider) => provider.id)).toContain(
            "codex-notes",
        );
        expect(merged.agents.map((agent) => agent.id)).toContain("dilbert");
        expect(merged.agents.find((agent) => agent.id === "dilbert")).toMatchObject({
            defaultVisible: false,
            visibilityOverrides: ["auro"],
            rootPath: "/home/tester/notes",
            defaultVariant: "high",
        });
    });

    test("preserves standalone custom providers when regenerating", () => {
        const generatedConfig = buildConfig(
            "/home/tester",
            "local",
            "tester@example.com",
        );
        const existingConfig = {
            ...generatedConfig,
            providers: [
                ...generatedConfig.providers,
                {
                    id: "codex-staged",
                    kind: "codex" as const,
                    label: "Codex Staged",
                    enabled: true,
                    idleTtlSeconds: 900,
                    modelCacheTtlSeconds: 300,
                    models: generatedConfig.providers[0]!.models,
                    codex: {
                        command: "codex",
                        args: ["app-server"],
                        baseEnv: {},
                        cwd: "/home/tester/staged",
                    },
                },
            ],
        };

        const merged = mergePreservedConfig({
            generatedConfig,
            existingConfig,
        });

        expect(merged.providers.map((provider) => provider.id)).toContain(
            "codex-staged",
        );
    });

    test("accepts preserved providers that rely on server defaults", () => {
        const parsed = tryParseExistingConfig(
            JSON.stringify({
                stateId: "custom-state",
                sandboxRoot: "/tmp/custom-sandboxes",
                providers: [
                    {
                        id: "codex-notes",
                        kind: "codex",
                        label: "Codex Notes",
                        enabled: true,
                        idleTtlSeconds: 900,
                        modelCacheTtlSeconds: 300,
                        codex: {
                            command: "codex",
                            baseEnv: {},
                            cwd: "/home/tester/notes",
                        },
                    },
                ],
                agents: [
                    {
                        id: "dilbert",
                        name: "Dilbert",
                        enabled: true,
                        rootPath: "/home/tester/notes",
                        providerIds: ["codex-notes"],
                        defaultProviderId: "codex-notes",
                    },
                ],
            }),
        );

        expect(parsed).not.toBeNull();
        expect(parsed?.providers[0]).toMatchObject({
            id: "codex-notes",
        });
        expect(parsed?.agents[0]).toMatchObject({
            id: "dilbert",
        });
    });

    test("replaces managed fixture agents with regenerated values", () => {
        const generatedConfig = buildConfig(
            "/home/tester",
            "local",
            "tester@example.com",
        );
        const existingConfig = {
            ...generatedConfig,
            agents: generatedConfig.agents.map((agent) =>
                agent.id === "agentchat-test"
                    ? {
                          ...agent,
                          rootPath: "/stale/path",
                          defaultVariant: "medium",
                      }
                    : agent,
            ),
        };

        const merged = mergePreservedConfig({
            generatedConfig,
            existingConfig,
        });

        expect(
            merged.agents.find((agent) => agent.id === "agentchat-test"),
        ).toMatchObject({
            rootPath: "/home/tester/agents/agentchat_test",
            defaultVariant: "low",
        });
    });

    test("treats malformed existing config as missing", () => {
        expect(tryParseExistingConfig("{ invalid json")).toBeNull();
        expect(tryParseExistingConfig("{}")).toBeNull();
        expect(tryParseExistingConfig("[]")).toBeNull();
        expect(
            tryParseExistingConfig(
                '{"providers":[null],"agents":[]}',
            ),
        ).toBeNull();
        expect(
            tryParseExistingConfig(
                '{"providers":[],"agents":[{"name":"missing-id"}]}',
            ),
        ).toBeNull();
        expect(
            tryParseExistingConfig(
                JSON.stringify({
                    providers: [
                        {
                            id: "codex-partial",
                            kind: "codex",
                        },
                    ],
                    agents: [],
                }),
            ),
        ).toBeNull();
        expect(
            tryParseExistingConfig(
                JSON.stringify({
                    providers: [],
                    agents: [
                        {
                            id: "dilbert",
                            name: "Dilbert",
                        },
                    ],
                }),
            ),
        ).toBeNull();
        expect(
            tryParseExistingConfig(
                JSON.stringify({
                    stateId: "",
                    providers: [],
                    agents: [],
                }),
            ),
        ).toBeNull();
        expect(
            tryParseExistingConfig(
                JSON.stringify({
                    sandboxRoot: "relative/path",
                    providers: [],
                    agents: [],
                }),
            ),
        ).toBeNull();
    });
});
