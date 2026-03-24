import { describe, expect, test } from "bun:test";

import { CodexAppServerClient } from "../codexAppServerClient.ts";
import type { AgentConfig, ProviderConfig } from "../config.ts";

function createProvider(args: string[]): ProviderConfig {
    return {
        id: "codex-test",
        kind: "codex",
        label: "Codex Test",
        enabled: true,
        idleTtlSeconds: 60,
        modelCacheTtlSeconds: 60,
        models: [],
        codex: {
            command: process.execPath,
            args,
            baseEnv: {},
            cwd: process.cwd(),
        },
    };
}

function createAgent(): AgentConfig {
    return {
        id: "agent-1",
        name: "Agent 1",
        enabled: true,
        defaultVisible: true,
        visibilityOverrides: [],
        rootPath: process.cwd(),
        providerIds: ["codex-test"],
        defaultProviderId: "codex-test",
        modelAllowlist: [],
        variantAllowlist: [],
        tags: [],
        sortOrder: 0,
        workspaceMode: "shared",
    };
}

describe("CodexAppServerClient", () => {
    test("falls back to SIGKILL when the child ignores SIGTERM", async () => {
        const client = new CodexAppServerClient({
            provider: createProvider([
                "-e",
                "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000);",
            ]),
            agent: createAgent(),
            stopTimeoutMs: 50,
        });

        const startedAt = Date.now();
        await client.stop();

        expect(Date.now() - startedAt).toBeLessThan(2_000);
    });
});
