import { describe, expect, test } from "bun:test";

import { createBackendSessionToken } from "../../../../packages/shared/src/core/backend-token";
import { createFetchHandler } from "../http.ts";
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
                modelCacheTtlSeconds: 300,
                models: [
                    {
                        id: "gpt-5.3-codex",
                        label: "GPT-5.3 Codex",
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
            {
                id: "codex-disabled",
                kind: "codex",
                label: "Disabled Provider",
                enabled: false,
                idleTtlSeconds: 900,
                modelCacheTtlSeconds: 300,
                models: [],
                codex: {
                    command: "codex",
                    args: ["app-server"],
                    baseEnv: {},
                    cwd: "/srv/codex",
                },
            },
        ],
        agents: [
            {
                id: "agent-visible",
                name: "Visible Agent",
                description: "Primary manual test agent",
                avatar: null,
                enabled: true,
                defaultVisible: true,
                visibilityOverrides: [],
                rootPath: "/srv/agents/visible",
                providerIds: ["codex-main"],
                defaultProviderId: "codex-main",
                defaultModel: "gpt-5.3-codex",
                defaultVariant: "balanced",
                modelAllowlist: [],
                variantAllowlist: [],
                tags: ["smoke"],
                sortOrder: 20,
                workspaceMode: "shared",
            },
            {
                id: "agent-disabled",
                name: "Disabled Agent",
                enabled: false,
                defaultVisible: true,
                visibilityOverrides: [],
                rootPath: "/srv/agents/disabled",
                providerIds: ["codex-main"],
                defaultProviderId: "codex-main",
                modelAllowlist: [],
                variantAllowlist: [],
                tags: [],
                sortOrder: 10,
                workspaceMode: "shared",
            },
            {
                id: "agent-fallback",
                name: "Fallback Agent",
                enabled: true,
                defaultVisible: true,
                visibilityOverrides: [],
                rootPath: "/srv/agents/fallback",
                providerIds: ["codex-disabled", "codex-main"],
                defaultProviderId: "codex-disabled",
                defaultModel: "missing-model",
                defaultVariant: "missing-variant",
                modelAllowlist: [],
                variantAllowlist: [],
                tags: [],
                sortOrder: 30,
                workspaceMode: "shared",
            },
            {
                id: "agent-no-provider",
                name: "Broken Agent",
                enabled: true,
                defaultVisible: true,
                visibilityOverrides: [],
                rootPath: "/srv/agents/broken",
                providerIds: ["codex-disabled"],
                defaultProviderId: "codex-disabled",
                modelAllowlist: [],
                variantAllowlist: [],
                tags: [],
                sortOrder: 40,
                workspaceMode: "shared",
            },
        ],
    };
}

function createV2Config(): AgentchatConfig {
    const config = createConfig();
    const provider = config.providers[0]!;
    if (provider.kind !== "codex") {
        throw new Error("Expected Codex provider.");
    }
    config.providers = [];
    config.agents = [config.agents[0]!];
    config.agents[0] = {
        ...config.agents[0]!,
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
    };
    return config;
}

async function createAuthRequest(url: string, email: string): Promise<Request> {
    const token = await createBackendSessionToken({
        claims: {
            sub: email,
            userId: `users:${email}`,
            email,
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + 60,
        },
        secret: "test-secret",
    });
    return new Request(url, {
        headers: {
            Authorization: `Bearer ${token}`,
        },
    });
}

describe("createFetchHandler", () => {
    test("excludes defaultVisible:false agents from unauthenticated bootstrap", async () => {
        const config = createConfig();
        config.agents[0]!.defaultVisible = false;
        const fetchHandler = createFetchHandler({
            getConfig: () => config,
        });

        const response = await fetchHandler(
            new Request("http://localhost:3030/api/bootstrap"),
        );
        const body = (await response.json()) as {
            agents: Array<{ id: string }>;
        };

        expect(response.status).toBe(200);
        expect(body.agents.map((a) => a.id)).not.toContain("agent-visible");
    });

    test("returns only enabled providers and agents from bootstrap", async () => {
        const fetchHandler = createFetchHandler({
            getConfig: () => createConfig(),
        });

        const response = await fetchHandler(
            new Request("http://localhost:3030/api/bootstrap"),
        );
        const body = (await response.json()) as {
            providers: Array<{ id: string }>;
            agents: Array<{ id: string }>;
        };

        expect(response.status).toBe(200);
        expect(body.providers).toMatchObject([{ id: "codex-main" }]);
        expect(body.agents).toMatchObject([
            { id: "agent-visible" },
            {
                id: "agent-fallback",
                defaultProviderId: "codex-main",
                defaultModel: "gpt-5.3-codex",
                defaultVariant: "balanced",
            },
        ]);
    });

    test("serves bootstrap, agent options, and models from v2 agent runtime config", async () => {
        const fetchHandler = createFetchHandler({
            getConfig: () => createV2Config(),
        });

        const bootstrapResponse = await fetchHandler(
            new Request("http://localhost:3030/api/bootstrap"),
        );
        const bootstrap = (await bootstrapResponse.json()) as {
            providers: Array<{ id: string }>;
            agents: Array<{
                id: string;
                providerIds: string[];
                defaultProviderId: string | null;
            }>;
        };

        expect(bootstrapResponse.status).toBe(200);
        expect(bootstrap.providers).toMatchObject([{ id: "codex-main" }]);
        expect(bootstrap.agents).toMatchObject([
            {
                id: "agent-visible",
                providerIds: ["codex-main"],
                defaultProviderId: "codex-main",
            },
        ]);

        const optionsResponse = await fetchHandler(
            new Request(
                "http://localhost:3030/api/agents/agent-visible/options",
            ),
        );
        const options = (await optionsResponse.json()) as {
            allowedProviders: Array<{ id: string }>;
            defaultProviderId: string | null;
        };
        expect(optionsResponse.status).toBe(200);
        expect(options.allowedProviders).toMatchObject([{ id: "codex-main" }]);
        expect(options.defaultProviderId).toBe("codex-main");

        const modelsResponse = await fetchHandler(
            new Request(
                "http://localhost:3030/api/providers/codex-main/models",
            ),
        );
        const models = (await modelsResponse.json()) as {
            providerId: string;
            models: Array<{ id: string }>;
        };
        expect(modelsResponse.status).toBe(200);
        expect(models.providerId).toBe("codex-main");
        expect(models.models).toMatchObject([{ id: "gpt-5.3-codex" }]);
    });

    test("does not expose disabled v2 agent runtimes through provider endpoints", async () => {
        const config = createV2Config();
        config.agents[0]!.enabled = false;
        const fetchHandler = createFetchHandler({
            getConfig: () => config,
        });

        const bootstrapResponse = await fetchHandler(
            new Request("http://localhost:3030/api/bootstrap"),
        );
        const bootstrap = (await bootstrapResponse.json()) as {
            providers: Array<{ id: string }>;
            agents: Array<{ id: string }>;
        };
        expect(bootstrapResponse.status).toBe(200);
        expect(bootstrap.providers).toEqual([]);
        expect(bootstrap.agents).toEqual([]);

        const modelsResponse = await fetchHandler(
            new Request(
                "http://localhost:3030/api/providers/codex-main/models",
            ),
        );
        expect(modelsResponse.status).toBe(404);
    });

    test("does not expose hidden v2 agent runtimes to users who cannot see the agent", async () => {
        const config = createV2Config();
        config.agents[0]!.defaultVisible = false;
        config.agents[0]!.visibilityOverrides = ["operator@example.com"];
        const fetchHandler = createFetchHandler({
            getConfig: () => config,
        });

        const anonymousBootstrapResponse = await fetchHandler(
            new Request("http://localhost:3030/api/bootstrap"),
        );
        const anonymousBootstrap =
            (await anonymousBootstrapResponse.json()) as {
                providers: Array<{ id: string }>;
                agents: Array<{ id: string }>;
            };
        expect(anonymousBootstrapResponse.status).toBe(200);
        expect(anonymousBootstrap.providers).toEqual([]);
        expect(anonymousBootstrap.agents).toEqual([]);

        const anonymousModelsResponse = await fetchHandler(
            new Request(
                "http://localhost:3030/api/providers/codex-main/models",
            ),
        );
        expect(anonymousModelsResponse.status).toBe(404);

        const originalBackendSecret = process.env.BACKEND_TOKEN_SECRET;
        process.env.BACKEND_TOKEN_SECRET = "test-secret";
        try {
            const operatorBootstrapResponse = await fetchHandler(
                await createAuthRequest(
                    "http://localhost:3030/api/bootstrap",
                    "operator@example.com",
                ),
            );
            const operatorBootstrap =
                (await operatorBootstrapResponse.json()) as {
                    providers: Array<{ id: string }>;
                    agents: Array<{ id: string }>;
                };
            expect(operatorBootstrapResponse.status).toBe(200);
            expect(operatorBootstrap.providers).toMatchObject([
                { id: "codex-main" },
            ]);
            expect(operatorBootstrap.agents).toMatchObject([
                { id: "agent-visible" },
            ]);

            const operatorModelsResponse = await fetchHandler(
                await createAuthRequest(
                    "http://localhost:3030/api/providers/codex-main/models",
                    "operator@example.com",
                ),
            );
            expect(operatorModelsResponse.status).toBe(200);
        } finally {
            if (originalBackendSecret === undefined) {
                delete process.env.BACKEND_TOKEN_SECRET;
            } else {
                process.env.BACKEND_TOKEN_SECRET = originalBackendSecret;
            }
        }
    });

    test("reports local auth provider metadata in bootstrap", async () => {
        const fetchHandler = createFetchHandler({
            getConfig: () => ({
                ...createConfig(),
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
            }),
        });

        const response = await fetchHandler(
            new Request("http://localhost:3030/api/bootstrap"),
        );
        const body = (await response.json()) as {
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
        };

        expect(response.status).toBe(200);
        expect(body.auth).toEqual({
            defaultProviderId: "local-main",
            requiresLogin: true,
            activeProvider: {
                id: "local-main",
                kind: "local",
                enabled: true,
                allowlistMode: null,
                allowSignup: false,
            },
            providers: [
                {
                    id: "local-main",
                    kind: "local",
                    enabled: true,
                    allowlistMode: null,
                    allowSignup: false,
                },
            ],
        });
    });

    test("returns agent options for enabled agents only", async () => {
        const fetchHandler = createFetchHandler({
            getConfig: () => createConfig(),
        });

        const response = await fetchHandler(
            new Request(
                "http://localhost:3030/api/agents/agent-visible/options",
            ),
        );
        const body = (await response.json()) as {
            agentId: string;
            allowedProviders: Array<{ id: string }>;
            defaultModel: string | null;
            defaultVariant: string | null;
        };

        expect(response.status).toBe(200);
        expect(body.agentId).toBe("agent-visible");
        expect(body.allowedProviders).toMatchObject([{ id: "codex-main" }]);
        expect(body.defaultModel).toBe("gpt-5.3-codex");
        expect(body.defaultVariant).toBe("balanced");
    });

    test("falls back to an enabled provider and valid defaults for agent options", async () => {
        const fetchHandler = createFetchHandler({
            getConfig: () => createConfig(),
        });

        const response = await fetchHandler(
            new Request(
                "http://localhost:3030/api/agents/agent-fallback/options",
            ),
        );
        const body = (await response.json()) as {
            defaultProviderId: string | null;
            defaultModel: string | null;
            defaultVariant: string | null;
        };

        expect(response.status).toBe(200);
        expect(body.defaultProviderId).toBe("codex-main");
        expect(body.defaultModel).toBe("gpt-5.3-codex");
        expect(body.defaultVariant).toBe("balanced");
    });

    test("returns 404 for disabled agents", async () => {
        const fetchHandler = createFetchHandler({
            getConfig: () => createConfig(),
        });

        const response = await fetchHandler(
            new Request(
                "http://localhost:3030/api/agents/agent-disabled/options",
            ),
        );

        expect(response.status).toBe(404);
    });

    test("returns 404 for enabled agents with no enabled providers", async () => {
        const fetchHandler = createFetchHandler({
            getConfig: () => createConfig(),
        });

        const response = await fetchHandler(
            new Request(
                "http://localhost:3030/api/agents/agent-no-provider/options",
            ),
        );

        expect(response.status).toBe(404);
    });

    test("returns model metadata for enabled providers only", async () => {
        const fetchHandler = createFetchHandler({
            getConfig: () => createConfig(),
            modelCatalog: {
                getProviderModels: async (providerId) => ({
                    providerId,
                    fetchedAt: "2026-03-13T12:00:00.000Z",
                    expiresAt: "2026-03-13T12:05:00.000Z",
                    models: [
                        {
                            id: "gpt-5.3-codex-live",
                            label: "GPT-5.3 Codex Live",
                            supportsReasoning: true,
                            variants: [{ id: "balanced", label: "Balanced" }],
                        },
                    ],
                }),
            },
        });

        const response = await fetchHandler(
            new Request(
                "http://localhost:3030/api/providers/codex-main/models",
            ),
        );
        const body = (await response.json()) as {
            providerId: string;
            models: Array<{ id: string; variants: Array<{ id: string }> }>;
        };

        expect(response.status).toBe(200);
        expect(body.providerId).toBe("codex-main");
        expect(body.models).toMatchObject([
            {
                id: "gpt-5.3-codex-live",
                variants: [{ id: "balanced" }],
            },
        ]);
    });

    test("includes runtime env diagnostics", async () => {
        const originalBackendSecret = process.env.BACKEND_TOKEN_SECRET;
        const originalConvexUrl = process.env.CONVEX_URL;
        const originalRuntimeSecret = process.env.RUNTIME_INGRESS_SECRET;

        process.env.BACKEND_TOKEN_SECRET = "backend-secret";
        delete process.env.CONVEX_URL;
        process.env.RUNTIME_INGRESS_SECRET = "runtime-secret";

        try {
            const fetchHandler = createFetchHandler({
                getConfig: () => createConfig(),
            });

            const response = await fetchHandler(
                new Request("http://localhost:3030/api/diagnostics"),
            );
            const body = (await response.json()) as {
                config: {
                    loadedAt: number;
                    lastReloadAttemptAt: number | null;
                    lastReloadError: string | null;
                };
                runtimeEnv: {
                    ok: boolean;
                    diagnostics: Array<{
                        key: string;
                        configured: boolean;
                    }>;
                };
                issues: Array<{
                    code: string;
                    severity: "error" | "warning";
                    scope: string;
                }>;
            };

            expect(response.status).toBe(200);
            expect(body.config).toEqual({
                loadedAt: expect.any(Number),
                lastReloadAttemptAt: null,
                lastReloadError: null,
            });
            expect(body.runtimeEnv.ok).toBe(false);
            expect(body.runtimeEnv.diagnostics).toEqual([
                expect.objectContaining({
                    key: "BACKEND_TOKEN_SECRET",
                    configured: true,
                }),
                expect.objectContaining({
                    key: "CONVEX_URL",
                    configured: false,
                }),
                expect.objectContaining({
                    key: "RUNTIME_INGRESS_SECRET",
                    configured: true,
                }),
            ]);
            expect(body.issues).toContainEqual(
                expect.objectContaining({
                    code: "runtime_env_missing_convex_url",
                    severity: "error",
                    scope: "runtimeEnv:CONVEX_URL",
                }),
            );
        } finally {
            if (originalBackendSecret === undefined) {
                delete process.env.BACKEND_TOKEN_SECRET;
            } else {
                process.env.BACKEND_TOKEN_SECRET = originalBackendSecret;
            }

            if (originalConvexUrl === undefined) {
                delete process.env.CONVEX_URL;
            } else {
                process.env.CONVEX_URL = originalConvexUrl;
            }

            if (originalRuntimeSecret === undefined) {
                delete process.env.RUNTIME_INGRESS_SECRET;
            } else {
                process.env.RUNTIME_INGRESS_SECRET = originalRuntimeSecret;
            }
        }
    });

    test("returns 404 for disabled providers", async () => {
        const fetchHandler = createFetchHandler({
            getConfig: () => createConfig(),
        });

        const response = await fetchHandler(
            new Request(
                "http://localhost:3030/api/providers/codex-disabled/models",
            ),
        );

        expect(response.status).toBe(404);
    });

    test("returns diagnostics and health summary", async () => {
        const fetchHandler = createFetchHandler({
            getConfig: () => createConfig(),
        });

        const healthResponse = await fetchHandler(
            new Request("http://localhost:3030/health"),
        );
        const healthBody = (await healthResponse.json()) as {
            ok: boolean;
            summary: {
                enabledProviderCount: number;
                enabledAgentCount: number;
            };
        };

        expect(healthResponse.status).toBe(200);
        expect(healthBody.ok).toBe(false);
        expect(healthBody.summary.enabledProviderCount).toBe(1);
        expect(healthBody.summary.enabledAgentCount).toBe(3);

        const diagnosticsResponse = await fetchHandler(
            new Request("http://localhost:3030/api/diagnostics"),
        );
        const diagnosticsBody = (await diagnosticsResponse.json()) as {
            config: {
                loadedAt: number;
                lastReloadAttemptAt: number | null;
                lastReloadError: string | null;
            };
            ok: boolean;
            agents: Array<{ id: string; issues: string[] }>;
            issues: Array<{ code: string; scope: string }>;
        };

        expect(diagnosticsResponse.status).toBe(200);
        expect(diagnosticsBody.config).toEqual({
            loadedAt: expect.any(Number),
            lastReloadAttemptAt: null,
            lastReloadError: null,
        });
        expect(diagnosticsBody.ok).toBe(false);
        expect(diagnosticsBody.agents).toContainEqual(
            expect.objectContaining({
                id: "agent-no-provider",
                issues: expect.arrayContaining([
                    "Agent has no enabled providers.",
                ]),
            }),
        );
        expect(diagnosticsBody.issues).toContainEqual(
            expect.objectContaining({
                code: "agent_no_enabled_providers",
                scope: "agent:agent-no-provider",
            }),
        );
    });

    test("adds CORS headers for browser requests", async () => {
        const fetchHandler = createFetchHandler({
            getConfig: () => createConfig(),
        });

        const response = await fetchHandler(
            new Request("http://localhost:3030/api/bootstrap", {
                headers: {
                    origin: "http://127.0.0.1:4040",
                },
            }),
        );

        expect(response.status).toBe(200);
        expect(response.headers.get("access-control-allow-origin")).toBe(
            "http://127.0.0.1:4040",
        );
        expect(response.headers.get("access-control-allow-methods")).toBe(
            "GET,OPTIONS",
        );
        expect(response.headers.get("vary")).toBe("origin");
    });

    test("responds to OPTIONS preflight requests", async () => {
        const fetchHandler = createFetchHandler({
            getConfig: () => createConfig(),
        });

        const response = await fetchHandler(
            new Request("http://localhost:3030/api/bootstrap", {
                method: "OPTIONS",
                headers: {
                    origin: "http://127.0.0.1:4040",
                },
            }),
        );

        expect(response.status).toBe(204);
        expect(response.headers.get("access-control-allow-origin")).toBe(
            "http://127.0.0.1:4040",
        );
    });

    test("surfaces config reload status in diagnostics", async () => {
        const fetchHandler = createFetchHandler({
            getConfig: () => createConfig(),
            getConfigStatus: () => ({
                loadedAt: 100,
                lastReloadAttemptAt: 200,
                lastReloadError: "Unexpected end of JSON input",
            }),
        });

        const response = await fetchHandler(
            new Request("http://localhost:3030/api/diagnostics"),
        );
        const body = (await response.json()) as {
            config: {
                loadedAt: number;
                lastReloadAttemptAt: number | null;
                lastReloadError: string | null;
            };
            issues: Array<{ code: string; scope: string }>;
        };

        expect(response.status).toBe(200);
        expect(body.config).toEqual({
            loadedAt: 100,
            lastReloadAttemptAt: 200,
            lastReloadError: "Unexpected end of JSON input",
        });
        expect(body.issues).toContainEqual(
            expect.objectContaining({
                code: "config_reload_failed",
                scope: "config",
            }),
        );
    });

    test("returns structured auth, provider, and agent issue codes in diagnostics", async () => {
        const fetchHandler = createFetchHandler({
            getConfig: () => {
                const config = createConfig();
                config.auth.providers.push({
                    id: "local-fallback",
                    kind: "local",
                    enabled: true,
                    allowSignup: true,
                });
                config.auth.providers[0]!.enabled = false;
                const provider = config.providers[0]!;
                if (provider.kind !== "codex") {
                    throw new Error("Expected Codex provider.");
                }
                provider.codex.cwd = "/missing/provider-cwd";
                config.agents[0]!.rootPath = "/missing/visible-agent";
                config.agents[2]!.rootPath = "/missing/fallback-agent";
                return config;
            },
        });

        const response = await fetchHandler(
            new Request("http://localhost:3030/api/diagnostics"),
        );
        const body = (await response.json()) as {
            issues: Array<{ code: string; scope: string }>;
        };

        expect(response.status).toBe(200);
        expect(body.issues).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    code: "auth_default_provider_fallback",
                    scope: "auth",
                }),
                expect.objectContaining({
                    code: "provider_codex_cwd_missing",
                    scope: "provider:codex-main",
                }),
                expect.objectContaining({
                    code: "agent_root_path_missing",
                    scope: "agent:agent-visible",
                }),
                expect.objectContaining({
                    code: "agent_default_provider_fallback",
                    scope: "agent:agent-fallback",
                }),
            ]),
        );
    });
});
