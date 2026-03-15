import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

type AgentchatConfig = {
    version: number;
    auth: {
        defaultProviderId: string;
        providers: Array<
            | {
                  id: string;
                  kind: "google";
                  enabled: boolean;
                  allowlistMode: string;
                  allowedEmails: string[];
                  allowedDomains: string[];
                  googleHostedDomain: string | null;
              }
            | {
                  id: string;
                  kind: "local";
                  enabled: boolean;
                  allowSignup: boolean;
              }
        >;
    };
    providers: Array<{
        id: string;
        kind: string;
        label: string;
        enabled: boolean;
        idleTtlSeconds: number;
        modelCacheTtlSeconds: number;
        models: Array<{
            id: string;
            label: string;
            enabled: boolean;
            supportsReasoning: boolean;
            variants: Array<{
                id: string;
                label: string;
                enabled: boolean;
            }>;
        }>;
        codex: {
            command: string;
            args: string[];
            baseEnv: Record<string, string>;
            cwd?: string;
        };
    }>;
    agents: Array<{
        id: string;
        name: string;
        description?: string;
        avatar?: string | null;
        enabled: boolean;
        rootPath: string;
        providerIds: string[];
        defaultProviderId: string;
        defaultModel?: string;
        defaultVariant?: string;
        modelAllowlist: string[];
        variantAllowlist: string[];
        tags: string[];
        sortOrder: number;
    }>;
};

type BootstrapPayload = {
    providers: Array<{ id: string }>;
    agents: Array<{ id: string }>;
};

type AgentOptionsPayload = {
    agentId: string;
    defaultProviderId: string;
    defaultModel: string | null;
    defaultVariant: string | null;
};

type ResolvedFallbackDefaults = {
    defaultProviderId: string;
    defaultModel: string | null;
    defaultVariant: string | null;
};

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

function readConfig(configPath: string): AgentchatConfig {
    return JSON.parse(readFileSync(configPath, "utf8")) as AgentchatConfig;
}

function writeConfig(configPath: string, config: AgentchatConfig): void {
    writeFileSync(configPath, `${JSON.stringify(config, null, 4)}\n`, "utf8");
}

async function writeConfigAndPause(
    configPath: string,
    config: AgentchatConfig,
): Promise<void> {
    writeConfig(configPath, config);
    await new Promise((resolve) => setTimeout(resolve, 300));
}

function resolveFallbackDefaults(params: {
    config: AgentchatConfig;
    agentId: string;
}): ResolvedFallbackDefaults {
    const agent = params.config.agents.find(
        (candidate) => candidate.id === params.agentId,
    );
    invariant(agent, `Missing agent ${params.agentId} in config.`);

    const provider =
        params.config.providers.find(
            (candidate) =>
                candidate.id === agent.defaultProviderId && candidate.enabled,
        ) ??
        params.config.providers.find(
            (candidate) =>
                candidate.enabled && agent.providerIds.includes(candidate.id),
        ) ??
        null;

    if (!provider) {
        return {
            defaultProviderId: agent.defaultProviderId,
            defaultModel: null,
            defaultVariant: null,
        };
    }

    const defaultModel =
        provider.models.find((model) => model.enabled)?.id ?? null;
    const defaultVariant =
        provider.models
            .find((model) => model.id === defaultModel)
            ?.variants.find((variant) => variant.enabled)?.id ?? null;

    return {
        defaultProviderId: provider.id,
        defaultModel,
        defaultVariant,
    };
}

async function main() {
    const serverUrl = trimTrailingSlash(
        process.argv[2]?.trim() || DEFAULT_SERVER_URL,
    );
    const repoRoot = getRepoRoot();
    const configPath = getConfigPath(repoRoot);
    const originalConfigText = readFileSync(configPath, "utf8");
    const originalConfig = JSON.parse(originalConfigText) as AgentchatConfig;

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

        const disableAgentConfig = structuredClone(originalConfig);
        const disableAgentTarget = disableAgentConfig.agents.find(
            (agent) => agent.id === agentId,
        );
        invariant(disableAgentTarget, `Missing agent ${agentId} in config.`);
        disableAgentTarget.enabled = false;
        await writeConfigAndPause(configPath, disableAgentConfig);

        await waitFor(
            `${agentId} to disappear from bootstrap`,
            async () => {
                const bootstrap = await fetchJson<BootstrapPayload>(
                    `${serverUrl}/api/bootstrap`,
                );
                return !bootstrap.agents.some((agent) => agent.id === agentId);
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
                return (
                    options.defaultProviderId ===
                        fallbackDefaults.defaultProviderId &&
                    options.defaultModel === fallbackDefaults.defaultModel &&
                    options.defaultVariant ===
                        fallbackDefaults.defaultVariant
                );
            },
            async () => {
                const options = await fetchJson<AgentOptionsPayload>(
                    `${serverUrl}/api/agents/${encodeURIComponent(agentId)}/options`,
                );
                return JSON.stringify(options);
            },
        );

        const disableProviderConfig = structuredClone(originalConfig);
        const disableProviderTarget = disableProviderConfig.providers.find(
            (provider) => provider.id === providerId,
        );
        invariant(
            disableProviderTarget,
            `Missing provider ${providerId} in config.`,
        );
        disableProviderTarget.enabled = false;
        await writeConfigAndPause(configPath, disableProviderConfig);

        await waitFor(
            `${providerId} to disappear from bootstrap`,
            async () => {
                const bootstrap = await fetchJson<BootstrapPayload>(
                    `${serverUrl}/api/bootstrap`,
                );
                return (
                    !bootstrap.providers.some(
                        (provider) => provider.id === providerId,
                    ) && bootstrap.agents.length === 0
                );
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

    console.log(
        JSON.stringify(
            {
                ok: true,
                serverUrl,
                checks: [
                    "agent disable reload",
                    "default fallback reload",
                    "provider disable reload",
                    "config restore",
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
