import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
    hasAgentDisappearedFromBootstrap,
    hasProviderDisappearedFromBootstrap,
    matchesResolvedFallbackDefaults,
    resolveFallbackDefaults,
    withOperatorAgentEnabled,
    withOperatorProviderEnabled,
    type OperatorAgentOptionsPayload as AgentOptionsPayload,
    type OperatorBootstrapPayload as BootstrapPayload,
    type OperatorSmokeConfig,
} from "./operator-smoke-helpers";

const DEFAULT_SERVER_URL = "http://127.0.0.1:3030";
const WAIT_TIMEOUT_MS = 20_000;
const WAIT_STEP_MS = 250;

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

function trimTrailingSlash(value: string): string {
    return value.replace(/\/+$/, "");
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

async function fetchStatus(url: string): Promise<number> {
    const response = await fetch(url, {
        headers: {
            "cache-control": "no-store",
        },
    });
    return response.status;
}

async function waitFor(
    description: string,
    predicate: () => Promise<boolean>,
    onTimeout?: () => Promise<string> | string,
): Promise<void> {
    const deadline = Date.now() + WAIT_TIMEOUT_MS;
    for (;;) {
        if (await predicate()) {
            return;
        }
        if (Date.now() >= deadline) {
            const detail = onTimeout ? await onTimeout() : null;
            throw new Error(
                detail
                    ? `Timed out waiting for ${description}. Last observed state: ${detail}`
                    : `Timed out waiting for ${description}.`,
            );
        }
        await new Promise((resolve) => setTimeout(resolve, WAIT_STEP_MS));
    }
}

function readConfig(configPath: string): OperatorSmokeConfig {
    return JSON.parse(readFileSync(configPath, "utf8")) as OperatorSmokeConfig;
}

function writeConfig(configPath: string, config: OperatorSmokeConfig): void {
    writeFileSync(configPath, `${JSON.stringify(config, null, 4)}\n`, "utf8");
}

async function writeConfigAndPause(
    configPath: string,
    config: OperatorSmokeConfig,
): Promise<void> {
    writeConfig(configPath, config);
    await new Promise((resolve) => setTimeout(resolve, 300));
}

function runLiveRuntimeProbe(params: {
    repoRoot: string;
    serverUrl: string;
    mode: "smoke" | "interrupt";
}): void {
    const scriptPath = path.join(
        params.repoRoot,
        "scripts",
        "testing",
        "live-runtime-smoke.ts",
    );
    const result = spawnSync(
        process.execPath,
        [
            scriptPath,
            "--mode",
            params.mode,
            "--server-url",
            params.serverUrl,
        ],
        {
            cwd: params.repoRoot,
            encoding: "utf8",
        },
    );

    if (result.status !== 0) {
        const detail = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim();
        throw new Error(
            `Live runtime ${params.mode} probe failed during config reload smoke: ${detail}`,
        );
    }
}

async function main() {
    const serverUrl = trimTrailingSlash(
        process.argv[2]?.trim() || DEFAULT_SERVER_URL,
    );
    const repoRoot = getRepoRoot();
    const configPath = getConfigPath(repoRoot);
    const originalConfigText = readFileSync(configPath, "utf8");
    const originalConfig = JSON.parse(originalConfigText) as OperatorSmokeConfig;

    const agentId = "agentchat-test";
    const providerId = "codex-main";

    try {
        const initialBootstrap = await fetchJson<BootstrapPayload>(
            `${serverUrl}/api/bootstrap`,
        );
        invariant(
            initialBootstrap.providers.some(
                (provider) => provider.id === providerId,
            ),
            `Expected ${providerId} in bootstrap before config reload smoke.`,
        );
        invariant(
            initialBootstrap.agents.some((agent) => agent.id === agentId),
            `Expected ${agentId} in bootstrap before config reload smoke.`,
        );
        const fallbackDefaults = resolveFallbackDefaults({
            config: originalConfig,
            agentId,
        });
        invariant(
            fallbackDefaults.defaultProviderId === providerId,
            `Expected ${agentId} to resolve ${providerId} before config reload smoke.`,
        );

        const disableAgentConfig = withOperatorAgentEnabled({
            config: originalConfig,
            agentId,
            enabled: false,
        });
        await writeConfigAndPause(configPath, disableAgentConfig);

        await waitFor(
            `${agentId} to disappear from bootstrap`,
            async () => {
                const bootstrap = await fetchJson<BootstrapPayload>(
                    `${serverUrl}/api/bootstrap`,
                );
                return hasAgentDisappearedFromBootstrap(bootstrap, agentId);
            },
            async () => {
                const bootstrap = await fetchJson<BootstrapPayload>(
                    `${serverUrl}/api/bootstrap`,
                );
                return JSON.stringify(bootstrap);
            },
        );
        await waitFor(`${agentId} options to return 404`, async () => {
            const status = await fetchStatus(
                `${serverUrl}/api/agents/${encodeURIComponent(agentId)}/options`,
            );
            return status === 404;
        });

        const fallbackConfig = structuredClone(originalConfig);
        const fallbackTarget = fallbackConfig.agents.find(
            (agent) => agent.id === agentId,
        );
        invariant(fallbackTarget, `Missing agent ${agentId} in config.`);
        fallbackTarget.defaultModel = "missing-model";
        fallbackTarget.defaultVariant = "missing-variant";
        await writeConfigAndPause(configPath, fallbackConfig);

        await waitFor(
            `fallback defaults for ${agentId}`,
            async () => {
                const options = await fetchJson<AgentOptionsPayload>(
                    `${serverUrl}/api/agents/${encodeURIComponent(agentId)}/options`,
                );
                return matchesResolvedFallbackDefaults({
                    options,
                    resolvedDefaults: fallbackDefaults,
                });
            },
            async () => {
                const options = await fetchJson<AgentOptionsPayload>(
                    `${serverUrl}/api/agents/${encodeURIComponent(agentId)}/options`,
                );
                return JSON.stringify(options);
            },
        );
        runLiveRuntimeProbe({
            repoRoot,
            serverUrl,
            mode: "smoke",
        });

        const disableProviderConfig = withOperatorProviderEnabled({
            config: originalConfig,
            providerId,
            enabled: false,
        });
        await writeConfigAndPause(configPath, disableProviderConfig);

        await waitFor(
            `${providerId} to disappear from bootstrap`,
            async () => {
                const bootstrap = await fetchJson<BootstrapPayload>(
                    `${serverUrl}/api/bootstrap`,
                );
                return hasProviderDisappearedFromBootstrap({
                    bootstrap,
                    providerId,
                });
            },
            async () => {
                const bootstrap = await fetchJson<BootstrapPayload>(
                    `${serverUrl}/api/bootstrap`,
                );
                return JSON.stringify(bootstrap);
            },
        );
        await waitFor(`${providerId} models to return 404`, async () => {
            const status = await fetchStatus(
                `${serverUrl}/api/providers/${encodeURIComponent(providerId)}/models`,
            );
            return status === 404;
        });
    } finally {
        writeFileSync(configPath, originalConfigText, "utf8");
        await waitFor(
            "original bootstrap state to return",
            async () => {
                const bootstrap = await fetchJson<BootstrapPayload>(
                    `${serverUrl}/api/bootstrap`,
                );
                return (
                    bootstrap.providers.some(
                        (provider) => provider.id === providerId,
                    ) && bootstrap.agents.some((agent) => agent.id === agentId)
                );
            },
            async () => {
                const bootstrap = await fetchJson<BootstrapPayload>(
                    `${serverUrl}/api/bootstrap`,
                );
                return JSON.stringify(bootstrap);
            },
        );
    }

    runLiveRuntimeProbe({
        repoRoot,
        serverUrl,
        mode: "interrupt",
    });

    console.log(
        JSON.stringify(
            {
                ok: true,
                serverUrl,
                checks: [
                    "agent disable reload",
                    "default fallback reload",
                    "post-fallback live runtime probe",
                    "provider disable reload",
                    "config restore",
                    "post-restore workspace runtime probe",
                ],
            },
            null,
            2,
        ),
    );
}

try {
    await main();
} catch (error) {
    console.error(
        error instanceof Error
            ? error.message
            : "Config reload smoke failed unexpectedly.",
    );
    process.exit(1);
}
