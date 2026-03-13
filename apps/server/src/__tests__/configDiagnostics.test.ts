import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, test } from "bun:test";

import {
    getAgentDiagnostics,
    getConfigDiagnostics,
    getProviderDiagnostics,
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
                rootPath: agentRoot,
                providerIds: ["codex-main", "codex-disabled"],
                defaultProviderId: "codex-main",
                defaultModel: "gpt-5.3-codex",
                defaultVariant: "balanced",
                modelAllowlist: [],
                variantAllowlist: [],
                tags: [],
                sortOrder: 10,
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
            rootPath: "/missing/broken",
            providerIds: ["codex-disabled"],
            defaultProviderId: "codex-disabled",
            modelAllowlist: [],
            variantAllowlist: [],
            tags: [],
            sortOrder: 20,
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
});
