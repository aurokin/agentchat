import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

function getRepoRoot(): string {
    const scriptDir = path.dirname(fileURLToPath(import.meta.url));
    return path.resolve(scriptDir, "..", "..");
}

function resolveGitUserEmail(repoRoot: string): string | null {
    try {
        const value = execFileSync("git", ["config", "user.email"], {
            cwd: repoRoot,
            encoding: "utf8",
        }).trim();
        return value.length > 0 ? value : null;
    } catch {
        return null;
    }
}

type AuthMode = "google" | "local";
const LOCAL_SMOKE_USERNAMES = ["smoke_1", "smoke_2"];

type GeneratedConfig = ReturnType<typeof buildConfig>;
type GeneratedAgent = GeneratedConfig["agents"][number];
type GeneratedProvider = GeneratedConfig["providers"][number];
type PreservedProviderVariant = {
    id: string;
    label: string;
    enabled: boolean;
};
type PreservedProviderModel = {
    id: string;
    label: string;
    enabled: boolean;
    supportsReasoning: boolean;
    variants?: PreservedProviderVariant[];
};
type PreservedProvider = Omit<GeneratedProvider, "models" | "codex"> & {
    models?: PreservedProviderModel[];
    codex: Omit<GeneratedProvider["codex"], "args"> & {
        args?: string[];
    };
};
type PreservedAgent = GeneratedAgent;
type PreservedConfig = {
    stateId?: string;
    sandboxRoot?: string;
    providers: PreservedProvider[];
    agents: PreservedAgent[];
};

function resolveAuthMode(): AuthMode {
    const flag = process.argv.find((arg) => arg.startsWith("--auth-mode="));
    const value =
        flag?.slice("--auth-mode=".length).trim() ||
        process.env.AGENTCHAT_TEST_AUTH_MODE?.trim() ||
        "local";

    if (value === "google" || value === "local") {
        return value;
    }

    throw new Error(
        `Unsupported auth mode '${value}'. Expected 'google' or 'local'.`,
    );
}

function buildAuthConfig(authMode: AuthMode, allowedEmail: string) {
    if (authMode === "local") {
        return {
            defaultProviderId: "local-main",
            providers: [
                {
                    id: "local-main",
                    kind: "local" as const,
                    enabled: true,
                    allowSignup: false,
                },
            ],
        };
    }

    return {
        defaultProviderId: "google-main",
        providers: [
            {
                id: "google-main",
                kind: "google" as const,
                enabled: true,
                allowlistMode: "email" as const,
                allowedEmails: [allowedEmail],
                allowedDomains: [],
                googleHostedDomain: null,
            },
        ],
    };
}

function buildOptionalAgents(homeDir: string) {
    const optionalAgents = [];
    const warcraftRoot = path.join(homeDir, "agents", "warcraft_simple");

    if (existsSync(warcraftRoot)) {
        optionalAgents.push({
            id: "warcraft-simple",
            name: "Warcraft Simple",
            description: "Warcraft-focused agent workspace.",
            avatar: null,
            enabled: true,
            rootPath: warcraftRoot,
            providerIds: ["codex-main"],
            defaultProviderId: "codex-main",
            defaultModel: "gpt-5.4",
            defaultVariant: "low",
            modelAllowlist: [],
            variantAllowlist: [],
            tags: ["warcraft"],
            sortOrder: 40,
        });
    }

    return optionalAgents;
}

function getFixtureVisibility(authMode: AuthMode) {
    if (authMode === "local") {
        return {
            defaultVisible: false,
            visibilityOverrides: LOCAL_SMOKE_USERNAMES,
        };
    }

    return {
        defaultVisible: true,
        visibilityOverrides: [],
    };
}

export function buildConfig(
    homeDir: string,
    authMode: AuthMode,
    allowedEmail: string,
) {
    const fixturesRoot = path.join(homeDir, "agents", "agentchat_test");
    const fixtureVisibility = getFixtureVisibility(authMode);

    return {
        version: 1,
        auth: buildAuthConfig(authMode, allowedEmail),
        providers: [
            {
                id: "codex-main",
                kind: "codex" as const,
                label: "Codex Main",
                enabled: true,
                idleTtlSeconds: 900,
                modelCacheTtlSeconds: 300,
                models: [
                    {
                        id: "gpt-5.1-codex-mini",
                        label: "GPT-5.1 Codex Mini",
                        enabled: true,
                        supportsReasoning: true,
                        variants: [
                            { id: "medium", label: "Medium", enabled: true },
                            { id: "high", label: "High", enabled: true },
                        ],
                    },
                    {
                        id: "gpt-5.4",
                        label: "GPT-5.4",
                        enabled: true,
                        supportsReasoning: true,
                        variants: [
                            {
                                id: "low",
                                label: "Low",
                                enabled: true,
                            },
                            {
                                id: "medium",
                                label: "Medium",
                                enabled: true,
                            },
                            { id: "high", label: "High", enabled: true },
                            { id: "xhigh", label: "X-High", enabled: true },
                        ],
                    },
                    {
                        id: "gpt-5.3-codex-spark",
                        label: "GPT-5.3 Codex Spark",
                        enabled: true,
                        supportsReasoning: true,
                        variants: [
                            { id: "low", label: "Low", enabled: true },
                            { id: "medium", label: "Medium", enabled: true },
                            { id: "high", label: "High", enabled: true },
                            { id: "xhigh", label: "X-High", enabled: true },
                        ],
                    },
                ],
                codex: {
                    command: "codex",
                    args: ["app-server"],
                    baseEnv: {},
                    cwd: fixturesRoot,
                },
            },
        ],
        agents: [
            {
                id: "agentchat-smoke",
                name: "Agentchat Smoke",
                description: "Ultra-cheap liveness fixture.",
                avatar: null,
                enabled: true,
                ...fixtureVisibility,
                rootPath: path.join(fixturesRoot, "smoke"),
                providerIds: ["codex-main"],
                defaultProviderId: "codex-main",
                defaultModel: "gpt-5.1-codex-mini",
                defaultVariant: "medium",
                modelAllowlist: [],
                variantAllowlist: [],
                tags: ["smoke"],
                sortOrder: 10,
            },
            {
                id: "agentchat-test",
                name: "Agentchat Test",
                description: "Deterministic read-only Codex confidence fixture.",
                avatar: null,
                enabled: true,
                ...fixtureVisibility,
                rootPath: fixturesRoot,
                providerIds: ["codex-main"],
                defaultProviderId: "codex-main",
                defaultModel: "gpt-5.4",
                defaultVariant: "low",
                modelAllowlist: [],
                variantAllowlist: [],
                tags: ["manual"],
                sortOrder: 20,
            },
            {
                id: "agentchat-workspace",
                name: "Agentchat Workspace",
                description:
                    "Small mutable workspace fixture for interruption and resume checks.",
                avatar: null,
                enabled: true,
                ...fixtureVisibility,
                rootPath: path.join(fixturesRoot, "workspace"),
                providerIds: ["codex-main"],
                defaultProviderId: "codex-main",
                defaultModel: "gpt-5.4",
                defaultVariant: "low",
                modelAllowlist: [],
                variantAllowlist: [],
                tags: ["workspace"],
                sortOrder: 30,
            },
            ...buildOptionalAgents(homeDir),
        ],
    };
}

function sortAgentsByOrder(agents: GeneratedAgent[]): GeneratedAgent[] {
    return [...agents].sort((left, right) => left.sortOrder - right.sortOrder);
}

function isStringRecord(value: unknown): value is Record<string, string> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return false;
    }

    return Object.values(value).every((entry) => typeof entry === "string");
}

function isValidProviderVariant(value: unknown): value is PreservedProviderVariant {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return false;
    }

    const variant = value as {
        id?: unknown;
        label?: unknown;
        enabled?: unknown;
    };
    return (
        typeof variant.id === "string" &&
        typeof variant.label === "string" &&
        typeof variant.enabled === "boolean"
    );
}

function isValidProviderModel(value: unknown): value is PreservedProviderModel {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return false;
    }

    const model = value as {
        id?: unknown;
        label?: unknown;
        enabled?: unknown;
        supportsReasoning?: unknown;
        variants?: unknown;
    };
    return (
        typeof model.id === "string" &&
        typeof model.label === "string" &&
        typeof model.enabled === "boolean" &&
        typeof model.supportsReasoning === "boolean" &&
        (model.variants === undefined ||
            (Array.isArray(model.variants) &&
                model.variants.every(isValidProviderVariant)))
    );
}

function isValidPreservedProvider(value: unknown): value is PreservedProvider {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return false;
    }

    const provider = value as {
        id?: unknown;
        kind?: unknown;
        label?: unknown;
        enabled?: unknown;
        idleTtlSeconds?: unknown;
        modelCacheTtlSeconds?: unknown;
        models?: unknown;
        codex?: unknown;
    };
    const codexConfig = provider.codex as
        | {
              command?: unknown;
              args?: unknown;
              baseEnv?: unknown;
              cwd?: unknown;
          }
        | undefined;

    return (
        typeof provider.id === "string" &&
        provider.kind === "codex" &&
        typeof provider.label === "string" &&
        typeof provider.enabled === "boolean" &&
        typeof provider.idleTtlSeconds === "number" &&
        Number.isInteger(provider.idleTtlSeconds) &&
        provider.idleTtlSeconds > 0 &&
        typeof provider.modelCacheTtlSeconds === "number" &&
        Number.isInteger(provider.modelCacheTtlSeconds) &&
        provider.modelCacheTtlSeconds > 0 &&
        (provider.models === undefined ||
            (Array.isArray(provider.models) &&
                provider.models.every(isValidProviderModel))) &&
        !!codexConfig &&
        typeof codexConfig.command === "string" &&
        (codexConfig.args === undefined ||
            (Array.isArray(codexConfig.args) &&
                codexConfig.args.every((arg) => typeof arg === "string"))) &&
        isStringRecord(codexConfig.baseEnv) &&
        (codexConfig.cwd === undefined || typeof codexConfig.cwd === "string")
    );
}

function isStringArray(value: unknown): value is string[] {
    return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isValidPreservedAgent(value: unknown): value is PreservedAgent {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return false;
    }

    const agent = value as {
        id?: unknown;
        name?: unknown;
        description?: unknown;
        avatar?: unknown;
        enabled?: unknown;
        rootPath?: unknown;
        providerIds?: unknown;
        defaultProviderId?: unknown;
        defaultModel?: unknown;
        defaultVariant?: unknown;
        defaultVisible?: unknown;
        visibilityOverrides?: unknown;
        modelAllowlist?: unknown;
        variantAllowlist?: unknown;
        tags?: unknown;
        sortOrder?: unknown;
        workspaceMode?: unknown;
    };

    return (
        typeof agent.id === "string" &&
        typeof agent.name === "string" &&
        (agent.description === undefined || typeof agent.description === "string") &&
        (agent.avatar === undefined ||
            agent.avatar === null ||
            typeof agent.avatar === "string") &&
        typeof agent.enabled === "boolean" &&
        typeof agent.rootPath === "string" &&
        isStringArray(agent.providerIds) &&
        agent.providerIds.length > 0 &&
        typeof agent.defaultProviderId === "string" &&
        (agent.defaultModel === undefined ||
            typeof agent.defaultModel === "string") &&
        (agent.defaultVariant === undefined ||
            typeof agent.defaultVariant === "string") &&
        (agent.defaultVisible === undefined ||
            typeof agent.defaultVisible === "boolean") &&
        (agent.visibilityOverrides === undefined ||
            isStringArray(agent.visibilityOverrides)) &&
        (agent.modelAllowlist === undefined ||
            isStringArray(agent.modelAllowlist)) &&
        (agent.variantAllowlist === undefined ||
            isStringArray(agent.variantAllowlist)) &&
        (agent.tags === undefined || isStringArray(agent.tags)) &&
        (agent.sortOrder === undefined ||
            (typeof agent.sortOrder === "number" &&
                Number.isInteger(agent.sortOrder))) &&
        (agent.workspaceMode === undefined ||
            agent.workspaceMode === "shared" ||
            agent.workspaceMode === "copy-on-conversation")
    );
}

function isPreservedConfigShape(value: unknown): value is PreservedConfig {
    if (!value || typeof value !== "object") {
        return false;
    }

    const candidate = value as Partial<PreservedConfig>;
    return (
        (candidate.stateId === undefined ||
            (typeof candidate.stateId === "string" &&
                candidate.stateId.length > 0)) &&
        (candidate.sandboxRoot === undefined ||
            (typeof candidate.sandboxRoot === "string" &&
                candidate.sandboxRoot.length > 0 &&
                path.isAbsolute(candidate.sandboxRoot))) &&
        Array.isArray(candidate.providers) &&
        candidate.providers.every(isValidPreservedProvider) &&
        Array.isArray(candidate.agents) &&
        candidate.agents.every(isValidPreservedAgent)
    );
}

export function tryParseExistingConfig(rawConfig: string): PreservedConfig | null {
    try {
        const parsed = JSON.parse(rawConfig) as unknown;
        return isPreservedConfigShape(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

function readExistingConfig(configPath: string): PreservedConfig | null {
    if (!existsSync(configPath)) {
        return null;
    }

    return tryParseExistingConfig(readFileSync(configPath, "utf8"));
}

export function mergePreservedConfig(params: {
    generatedConfig: GeneratedConfig;
    existingConfig: PreservedConfig | null;
}) {
    const { generatedConfig, existingConfig } = params;
    if (!existingConfig) {
        return generatedConfig;
    }

    const managedAgentIds = new Set(generatedConfig.agents.map((agent) => agent.id));
    const preservedAgents = existingConfig.agents.filter(
        (agent) => !managedAgentIds.has(agent.id),
    );
    const managedProviderIds = new Set(
        generatedConfig.providers.map((provider) => provider.id),
    );
    const preservedProviders = existingConfig.providers.filter(
        (provider) => !managedProviderIds.has(provider.id),
    );

    return {
        ...generatedConfig,
        stateId: existingConfig.stateId ?? generatedConfig.stateId,
        sandboxRoot: existingConfig.sandboxRoot ?? generatedConfig.sandboxRoot,
        providers: [...generatedConfig.providers, ...preservedProviders],
        agents: sortAgentsByOrder([
            ...generatedConfig.agents,
            ...preservedAgents,
        ]),
    };
}

function main() {
    const repoRoot = getRepoRoot();
    const configPath = path.join(repoRoot, "apps/server/agentchat.config.json");
    const dryRun = process.argv.includes("--dry-run");
    const force = process.argv.includes("--force");
    const fixturesRoot = path.join(os.homedir(), "agents", "agentchat_test");

    for (const requiredPath of [
        fixturesRoot,
        path.join(fixturesRoot, "smoke"),
        path.join(fixturesRoot, "workspace"),
    ]) {
        if (!existsSync(requiredPath)) {
            throw new Error(`Missing test fixture path: ${requiredPath}`);
        }
    }

    if (existsSync(configPath) && !force) {
        throw new Error(
            `Refusing to overwrite ${configPath}. Re-run with --force if you want to replace it.`,
        );
    }

    const allowedEmail =
        process.env.AGENTCHAT_ALLOWED_EMAIL?.trim() ||
        resolveGitUserEmail(repoRoot) ||
        "operator@example.com";
    const authMode = resolveAuthMode();

    const existingConfig = force ? readExistingConfig(configPath) : null;
    const config = mergePreservedConfig({
        generatedConfig: buildConfig(os.homedir(), authMode, allowedEmail),
        existingConfig,
    });
    const json = `${JSON.stringify(config, null, 4)}\n`;

    if (dryRun) {
        console.log(json);
        return;
    }

    writeFileSync(configPath, json, "utf8");
    console.log(`[agentchat] wrote ${configPath}`);
    console.log(`[agentchat] auth provider kind: ${authMode}`);
    if (authMode === "google") {
        console.log(`[agentchat] allowlisted email: ${allowedEmail}`);
    }
}

if (import.meta.main) {
    main();
}
