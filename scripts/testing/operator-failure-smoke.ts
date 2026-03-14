import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { trimTrailingSlash } from "./lib";

const DEFAULT_SERVER_URL = "http://127.0.0.1:3030";
const WAIT_TIMEOUT_MS = 20_000;
const WAIT_STEP_MS = 250;

type AgentchatConfig = {
    version: number;
    auth: unknown;
    providers: Array<{
        id: string;
        enabled: boolean;
        codex: {
            cwd?: string;
        };
    }>;
    agents: Array<{
        id: string;
        enabled: boolean;
        rootPath: string;
    }>;
};

type DiagnosticsPayload = {
    ok: boolean;
    config: {
        loadedAt: number;
        lastReloadAttemptAt: number | null;
        lastReloadError: string | null;
    };
    providers: Array<{
        id: string;
        issues: string[];
    }>;
    agents: Array<{
        id: string;
        issues: string[];
    }>;
};

type BootstrapPayload = {
    agents: Array<{ id: string }>;
};

function invariant(condition: unknown, message: string): asserts condition {
    if (!condition) {
        throw new Error(message);
    }
}

function getRepoRoot(): string {
    const scriptDir = path.dirname(fileURLToPath(import.meta.url));
    return path.resolve(scriptDir, "..", "..");
}

function getConfigPath(repoRoot: string): string {
    return path.join(repoRoot, "apps", "server", "agentchat.config.json");
}

async function fetchJson<T>(url: string): Promise<T> {
    const response = await fetch(url, {
        headers: {
            "cache-control": "no-store",
        },
    });

    if (!response.ok) {
        throw new Error(
            `Request failed (${response.status}) for ${url}: ${await response.text()}`,
        );
    }

    return (await response.json()) as T;
}

async function waitFor<T>(
    description: string,
    read: () => Promise<T>,
    predicate: (value: T) => boolean,
): Promise<T> {
    const deadline = Date.now() + WAIT_TIMEOUT_MS;
    for (;;) {
        const value = await read();
        if (predicate(value)) {
            return value;
        }

        if (Date.now() >= deadline) {
            throw new Error(
                `Timed out waiting for ${description}. Last observed state: ${JSON.stringify(value)}`,
            );
        }

        await new Promise((resolve) => setTimeout(resolve, WAIT_STEP_MS));
    }
}

function readConfig(configPath: string): AgentchatConfig {
    return JSON.parse(readFileSync(configPath, "utf8")) as AgentchatConfig;
}

function writeConfig(configPath: string, config: AgentchatConfig): void {
    writeFileSync(configPath, `${JSON.stringify(config, null, 4)}\n`, "utf8");
}

async function writeConfigAndPulse(
    configPath: string,
    config: AgentchatConfig,
): Promise<void> {
    writeConfig(configPath, config);
    await new Promise((resolve) => setTimeout(resolve, 150));
    writeConfig(configPath, config);
}

function writeBrokenConfig(configPath: string): void {
    writeFileSync(configPath, '{"version": 1,\n', "utf8");
}

async function main() {
    const baseUrl = trimTrailingSlash(
        process.argv[2]?.trim() || DEFAULT_SERVER_URL,
    );
    const repoRoot = getRepoRoot();
    const configPath = getConfigPath(repoRoot);
    const originalConfigText = readFileSync(configPath, "utf8");
    const originalConfig = JSON.parse(originalConfigText) as AgentchatConfig;

    const providerId = "codex-main";
    const agentId = "agentchat-test";

    try {
        const baseline = await fetchJson<DiagnosticsPayload>(
            `${baseUrl}/api/diagnostics`,
        );
        invariant(
            baseline.config.lastReloadError === null,
            "Expected a clean config reload status before operator failure smoke.",
        );

        writeBrokenConfig(configPath);
        const invalidDiagnostics = await waitFor(
            "invalid config reload error",
            () => fetchJson<DiagnosticsPayload>(`${baseUrl}/api/diagnostics`),
            (value) => value.config.lastReloadError !== null,
        );
        invariant(
            invalidDiagnostics.config.lastReloadError?.length,
            "Expected diagnostics to surface the invalid config reload error.",
        );

        const invalidBootstrap = await fetchJson<BootstrapPayload>(
            `${baseUrl}/api/bootstrap`,
        );
        invariant(
            invalidBootstrap.agents.some((agent) => agent.id === agentId),
            "Bootstrap should keep serving the last known good config after an invalid reload.",
        );

        const badRootConfig = structuredClone(originalConfig);
        const badRootAgent = badRootConfig.agents.find(
            (agent) => agent.id === agentId,
        );
        invariant(badRootAgent, `Missing agent ${agentId} in config.`);
        badRootAgent.rootPath = "/tmp/agentchat-missing-agent-root";
        await writeConfigAndPulse(configPath, badRootConfig);
        const recoveredConfig = await waitFor(
            "successful reload after invalid config",
            () => fetchJson<DiagnosticsPayload>(`${baseUrl}/api/diagnostics`),
            (value) =>
                value.config.lastReloadError === null &&
                value.config.loadedAt > invalidDiagnostics.config.loadedAt,
        );

        const missingRootDiagnostics = await waitFor(
            "missing agent rootPath diagnostics",
            () => fetchJson<DiagnosticsPayload>(`${baseUrl}/api/diagnostics`),
            (value) =>
                value.config.loadedAt >= recoveredConfig.config.loadedAt &&
                value.agents.some(
                    (agent) =>
                        agent.id === agentId &&
                        agent.issues.includes(
                            "Agent rootPath does not exist or is not a directory.",
                        ),
                ),
        );
        invariant(
            missingRootDiagnostics.ok === false,
            "Expected diagnostics.ok to be false when an agent rootPath is missing.",
        );

        const badProviderConfig = structuredClone(originalConfig);
        const badProvider = badProviderConfig.providers.find(
            (provider) => provider.id === providerId,
        );
        invariant(badProvider, `Missing provider ${providerId} in config.`);
        badProvider.codex.cwd = "/tmp/agentchat-missing-provider-cwd";
        await writeConfigAndPulse(configPath, badProviderConfig);

        const missingCwdDiagnostics = await waitFor(
            "missing provider cwd diagnostics",
            () => fetchJson<DiagnosticsPayload>(`${baseUrl}/api/diagnostics`),
            (value) =>
                value.config.lastReloadError === null &&
                value.providers.some(
                    (provider) =>
                        provider.id === providerId &&
                        provider.issues.includes(
                            "Configured codex.cwd does not exist or is not a directory.",
                        ),
                ),
        );
        invariant(
            missingCwdDiagnostics.ok === false,
            "Expected diagnostics.ok to be false when a provider cwd is missing.",
        );

        await writeConfigAndPulse(configPath, originalConfig);
        const restoredDiagnostics = await waitFor(
            "restored diagnostics",
            () => fetchJson<DiagnosticsPayload>(`${baseUrl}/api/diagnostics`),
            (value) =>
                value.config.lastReloadError === null &&
                !value.agents.some((agent) => agent.id === agentId && agent.issues.length > 0) &&
                !value.providers.some(
                    (provider) =>
                        provider.id === providerId &&
                        provider.issues.includes(
                            "Configured codex.cwd does not exist or is not a directory.",
                        ),
                ),
        );

        console.log(
            JSON.stringify(
                {
                    ok: true,
                    baseUrl,
                    checks: [
                        "invalid config reload surfaced",
                        "last known good config kept serving",
                        "missing agent rootPath surfaced",
                        "missing provider cwd surfaced",
                        "restored config cleared diagnostics",
                    ],
                    restoredConfigLoadedAt: restoredDiagnostics.config.loadedAt,
                },
                null,
                2,
            ),
        );
    } finally {
        writeFileSync(configPath, originalConfigText, "utf8");
    }
}

await main();
