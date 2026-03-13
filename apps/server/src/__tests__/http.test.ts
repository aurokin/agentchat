import { describe, expect, test } from "bun:test";

import { createFetchHandler } from "../http.ts";
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
                rootPath: "/srv/agents/visible",
                providerIds: ["codex-main"],
                defaultProviderId: "codex-main",
                defaultModel: "gpt-5.3-codex",
                defaultVariant: "balanced",
                modelAllowlist: [],
                variantAllowlist: [],
                tags: ["smoke"],
                sortOrder: 20,
            },
            {
                id: "agent-disabled",
                name: "Disabled Agent",
                enabled: false,
                rootPath: "/srv/agents/disabled",
                providerIds: ["codex-main"],
                defaultProviderId: "codex-main",
                modelAllowlist: [],
                variantAllowlist: [],
                tags: [],
                sortOrder: 10,
            },
        ],
    };
}

describe("createFetchHandler", () => {
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
        expect(body.agents).toMatchObject([{ id: "agent-visible" }]);
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

    test("returns model metadata for enabled providers only", async () => {
        const fetchHandler = createFetchHandler({
            getConfig: () => createConfig(),
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
                id: "gpt-5.3-codex",
                variants: [{ id: "balanced" }],
            },
        ]);
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
});
