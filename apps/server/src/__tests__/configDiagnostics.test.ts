import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, test } from "bun:test";

import {
    getAgentDiagnostics,
    getConfigDiagnostics,
    getProviderDiagnostics,
    getVisibleAgents,
    isAgentVisible,
    resolveAgentDefaults,
} from "../configDiagnostics.ts";
import type { AgentchatConfig } from "../config.ts";

const tempRoots: string[] = [];

function makeTempDir(name: string): string {
    const dir = mkdtempSync(path.join(tmpdir(), `${name}-`));
    tempRoots.push(dir);
    return dir;
}

function createConfig(): AgentchatConfig {
    const providerCwd = makeTempDir("provider-cwd");
    const agentRoot = makeTempDir("agent-root");
    const commandDir = makeTempDir("command-dir");
    const commandPath = path.join(commandDir, "codex");
    writeFileSync(commandPath, "#!/bin/sh\n");

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
                            { id: "fast", label: "Fast", enabled: true },
                            {
                                id: "balanced",
                                label: "Balanced",
                                enabled: true,
                            },
                        ],
                    },
                ],
                codex: {
                    command: commandPath,
                    args: ["app-server"],
                    baseEnv: {},
                    cwd: providerCwd,
                },
            },
            {
                id: "codex-disabled",
                kind: "codex",
                label: "Disabled",
                enabled: false,
                idleTtlSeconds: 900,
                modelCacheTtlSeconds: 300,
                models: [],
                codex: {
                    command: "codex",
                    args: ["app-server"],
                    baseEnv: {},
                    cwd: providerCwd,
                },
            },
        ],
        agents: [
            {
                id: "agent-main",
                name: "Main Agent",
                enabled: true,
                defaultVisible: true,
                visibilityOverrides: [],
                rootPath: agentRoot,
                providerIds: ["codex-main", "codex-disabled"],
                defaultProviderId: "codex-main",
                defaultModel: "gpt-5.3-codex",
                defaultVariant: "balanced",
                modelAllowlist: [],
                variantAllowlist: [],
                tags: [],
                sortOrder: 10,
                workspaceMode: "shared",
            },
        ],
    };
}

afterEach(() => {
    for (const tempRoot of tempRoots.splice(0)) {
        rmSync(tempRoot, { force: true, recursive: true });
    }
});

describe("configDiagnostics", () => {
    test("marks a healthy enabled provider as ready", () => {
        const config = createConfig();
        const provider = config.providers[0]!;

        expect(getProviderDiagnostics(provider)).toMatchObject({
            id: "codex-main",
            ready: true,
            issues: [],
        });
    });

    test("reports missing directories and disabled default provider fallbacks", () => {
        const config = createConfig();
        config.providers[0]!.codex.cwd = "/missing/provider";
        config.agents[0]!.rootPath = "/missing/agent";
        config.agents[0]!.defaultProviderId = "codex-disabled";

        const providerDiagnostics = getProviderDiagnostics(
            config.providers[0]!,
        );
        const agentDiagnostics = getAgentDiagnostics(config, config.agents[0]!);

        expect(providerDiagnostics.ready).toBe(false);
        expect(providerDiagnostics.issues).toContain(
            "Configured codex.cwd does not exist or is not a directory.",
        );
        expect(agentDiagnostics.ready).toBe(false);
        expect(agentDiagnostics.issues).toContain(
            "Agent rootPath does not exist or is not a directory.",
        );
        expect(agentDiagnostics.issues).toContain(
            "Agent default provider is disabled; fallback will be used.",
        );
    });

    test("resolves agent defaults against enabled providers and variants", () => {
        const config = createConfig();
        const agent = config.agents[0]!;

        agent.defaultProviderId = "codex-disabled";
        agent.defaultModel = "missing-model";
        agent.defaultVariant = "missing-variant";

        expect(resolveAgentDefaults(config, agent)).toMatchObject({
            defaultProviderId: "codex-main",
            defaultModel: "gpt-5.3-codex",
            defaultVariant: "fast",
        });
    });

    test("summarizes global readiness", () => {
        const config = createConfig();
        const extraAgentRoot = makeTempDir("agent-fallback");
        mkdirSync(extraAgentRoot, { recursive: true });

        config.agents.push({
            id: "agent-broken",
            name: "Broken Agent",
            enabled: true,
            defaultVisible: true,
            visibilityOverrides: [],
            rootPath: "/missing/broken",
            providerIds: ["codex-disabled"],
            defaultProviderId: "codex-disabled",
            modelAllowlist: [],
            variantAllowlist: [],
            tags: [],
            sortOrder: 20,
            workspaceMode: "shared",
        });

        const diagnostics = getConfigDiagnostics(config);

        expect(diagnostics.ok).toBe(false);
        expect(diagnostics.summary).toMatchObject({
            enabledProviderCount: 1,
            readyProviderCount: 1,
            enabledAgentCount: 2,
            readyAgentCount: 1,
        });
    });

    test("reports the active auth provider kind", () => {
        const config = createConfig();
        config.auth.defaultProviderId = "google-main";

        const diagnostics = getConfigDiagnostics(config);

        expect(diagnostics.auth).toEqual({
            activeProviderKind: "google",
            issues: [],
        });
    });

    test("reports auth fallback when the configured default provider is disabled", () => {
        const config = createConfig();
        config.auth.providers.push({
            id: "local-fallback",
            kind: "local",
            enabled: true,
            allowSignup: true,
        });
        config.auth.defaultProviderId = "google-main";
        config.auth.providers[0]!.enabled = false;

        const diagnostics = getConfigDiagnostics(config);

        expect(diagnostics.auth).toEqual({
            activeProviderKind: "local",
            issues: [
                "Configured default auth provider is disabled; fallback will be used.",
            ],
        });
    });

    test("reports when no enabled auth providers are configured", () => {
        const config = createConfig();
        config.auth.providers[0]!.enabled = false;

        const diagnostics = getConfigDiagnostics(config);

        expect(diagnostics.auth).toEqual({
            activeProviderKind: null,
            issues: ["No enabled auth providers are configured."],
        });
    });
});

describe("agent visibility", () => {
    test("getVisibleAgents without username returns only defaultVisible agents", () => {
        const config = createConfig();
        config.agents[0]!.defaultVisible = false;

        const agents = getVisibleAgents(config);
        expect(agents).toEqual([]);
    });

    test("getVisibleAgents returns defaultVisible agents when no username", () => {
        const config = createConfig();
        config.agents[0]!.defaultVisible = true;

        const agents = getVisibleAgents(config);
        expect(agents).toHaveLength(1);
        expect(agents[0]!.id).toBe("agent-main");
    });

    test("visibilityOverrides grants access to hidden agents", () => {
        const config = createConfig();
        config.agents[0]!.defaultVisible = false;
        config.agents[0]!.visibilityOverrides = ["smoke_1", "smoke_2"];

        expect(getVisibleAgents(config)).toEqual([]);
        expect(getVisibleAgents(config, "smoke_1")).toHaveLength(1);
        expect(getVisibleAgents(config, "smoke_2")).toHaveLength(1);
        expect(getVisibleAgents(config, "other_user")).toEqual([]);
    });

    test("visibilityOverrides revokes access to visible agents", () => {
        const config = createConfig();
        config.agents[0]!.defaultVisible = true;
        config.agents[0]!.visibilityOverrides = ["blocked_user"];

        expect(getVisibleAgents(config)).toHaveLength(1);
        expect(getVisibleAgents(config, "normal_user")).toHaveLength(1);
        expect(getVisibleAgents(config, "blocked_user")).toEqual([]);
    });

    test("isAgentVisible returns false for disabled agents", () => {
        const config = createConfig();
        config.agents[0]!.enabled = false;

        expect(isAgentVisible(config, "agent-main", null)).toBe(false);
    });

    test("isAgentVisible respects visibility overrides", () => {
        const config = createConfig();
        config.agents[0]!.defaultVisible = false;
        config.agents[0]!.visibilityOverrides = ["auro"];

        expect(isAgentVisible(config, "agent-main", null)).toBe(false);
        expect(isAgentVisible(config, "agent-main", "auro")).toBe(true);
        expect(isAgentVisible(config, "agent-main", "other")).toBe(false);
    });

    test("isAgentVisible returns false for nonexistent agents", () => {
        const config = createConfig();
        expect(isAgentVisible(config, "nonexistent", "auro")).toBe(false);
    });
});
