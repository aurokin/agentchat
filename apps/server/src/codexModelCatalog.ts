import { getProviderConfig } from "./config.ts";
import type { AgentConfig, AgentchatConfig, ProviderConfig } from "./config.ts";
import type { CreateCodexClient } from "./codexAppServerClient.ts";
import { CodexRuntimeKind } from "./codexRuntimeKind.ts";
import type { ProviderModelCatalogEntry, RuntimeKind } from "./runtimeKind.ts";
import {
    RuntimeKindRegistry,
    runtimeKindRegistryFromSingleKind,
} from "./runtimeKindRegistry.ts";

export type { ProviderModelCatalogEntry };

type ProviderModelsPayload = {
    providerId: string;
    fetchedAt: string | null;
    expiresAt: string | null;
    models: ProviderModelCatalogEntry[];
};

export type ProviderModelsProbe = {
    providerId: string;
    ok: boolean;
    modelCount: number;
    error: string | null;
};

type CachedProviderModels = ProviderModelsPayload & {
    expiresAtEpochMs: number;
};

const EMPTY_CATALOG_ERROR = "Codex model catalog returned no visible models.";

function buildFallbackModels(provider: ProviderConfig): ProviderModelsPayload {
    return {
        providerId: provider.id,
        fetchedAt: null,
        expiresAt: null,
        models: provider.models
            .filter((model) => model.enabled)
            .map((model) => ({
                id: model.id,
                label: model.label,
                supportsReasoning: model.supportsReasoning,
                variants: model.variants
                    .filter((variant) => variant.enabled)
                    .map((variant) => ({
                        id: variant.id,
                        label: variant.label,
                    })),
                defaultVariantId: null,
                providerMetadata: {},
            })),
    };
}

function assertLiveModelsAvailable(
    models: ProviderModelCatalogEntry[],
): ProviderModelCatalogEntry[] {
    if (models.length === 0) {
        throw new Error(EMPTY_CATALOG_ERROR);
    }

    return models;
}

function toBootstrapAgent(provider: ProviderConfig): AgentConfig {
    const rootPath =
        provider.kind === "codex"
            ? (provider.codex.cwd ?? process.cwd())
            : provider.kind === "acp"
              ? (provider.acp.cwd ?? process.cwd())
              : (provider.claudeCode.cwd ?? process.cwd());
    return {
        id: "__agentchat_provider_models__",
        name: "Agentchat Provider Models",
        enabled: true,
        defaultVisible: true,
        visibilityOverrides: [],
        rootPath,
        providerIds: [provider.id],
        defaultProviderId: provider.id,
        modelAllowlist: [],
        variantAllowlist: [],
        tags: [],
        sortOrder: 0,
        workspaceMode: "shared",
    };
}

function sortRecordEntries(record: Record<string, string>) {
    return Object.fromEntries(
        Object.entries(record).sort(([left], [right]) =>
            left.localeCompare(right),
        ),
    );
}

function getProviderModelCacheKey(provider: ProviderConfig): string {
    const runtime =
        provider.kind === "codex"
            ? {
                  command: provider.codex.command,
                  args: provider.codex.args,
                  baseEnv: sortRecordEntries(provider.codex.baseEnv),
                  cwd: provider.codex.cwd ?? null,
              }
            : provider.kind === "acp"
              ? {
                    command: provider.acp.command,
                    args: provider.acp.args,
                    baseEnv: sortRecordEntries(provider.acp.baseEnv),
                    cwd: provider.acp.cwd ?? null,
                    mcpServers: provider.acp.mcpServers,
                    permissionMode: provider.acp.permissionMode,
                    timeoutMs: provider.acp.timeoutMs ?? null,
                }
              : {
                    command: provider.claudeCode.command,
                    args: provider.claudeCode.args,
                    baseEnv: sortRecordEntries(provider.claudeCode.baseEnv),
                    cwd: provider.claudeCode.cwd ?? null,
                    permissionMode: provider.claudeCode.permissionMode,
                    timeoutMs: provider.claudeCode.timeoutMs ?? null,
                };
    return JSON.stringify({
        providerId: provider.id,
        kind: provider.kind,
        modelCacheTtlSeconds: provider.modelCacheTtlSeconds,
        runtime,
        fallbackModels: provider.models.map((model) => ({
            id: model.id,
            label: model.label,
            enabled: model.enabled,
            supportsReasoning: model.supportsReasoning,
            variants: model.variants.map((variant) => ({
                id: variant.id,
                label: variant.label,
                enabled: variant.enabled,
            })),
        })),
    });
}

export class CodexModelCatalog {
    private readonly getConfig: () => AgentchatConfig;
    private readonly runtimeKinds: RuntimeKindRegistry;
    private readonly now: () => number;
    private readonly cache = new Map<string, CachedProviderModels>();

    constructor(params: {
        getConfig: () => AgentchatConfig;
        createClient?: CreateCodexClient;
        runtimeKind?: RuntimeKind;
        runtimeKinds?: RuntimeKindRegistry;
        now?: () => number;
    }) {
        this.getConfig = params.getConfig;
        this.runtimeKinds =
            params.runtimeKinds ??
            (params.runtimeKind
                ? runtimeKindRegistryFromSingleKind(params.runtimeKind)
                : params.createClient
                  ? new RuntimeKindRegistry([
                        new CodexRuntimeKind({
                            createClient: params.createClient,
                        }),
                    ])
                  : RuntimeKindRegistry.default());
        this.now = params.now ?? (() => Date.now());
    }

    async getProviderModels(
        providerId: string,
    ): Promise<ProviderModelsPayload | null> {
        const resolvedProvider = getProviderConfig(
            this.getConfig(),
            providerId,
        );
        const provider = resolvedProvider?.enabled ? resolvedProvider : null;
        if (!provider) {
            return null;
        }

        const now = this.now();
        const cacheKey = getProviderModelCacheKey(provider);
        const cached = this.cache.get(cacheKey);
        if (cached && cached.expiresAtEpochMs > now) {
            return {
                providerId: cached.providerId,
                fetchedAt: cached.fetchedAt,
                expiresAt: cached.expiresAt,
                models: cached.models,
            };
        }

        try {
            const liveModels = assertLiveModelsAvailable(
                await this.fetchLiveModels(provider),
            );
            const fetchedAt = new Date(now).toISOString();
            const expiresAtEpochMs = now + provider.modelCacheTtlSeconds * 1000;
            const expiresAt = new Date(expiresAtEpochMs).toISOString();
            const payload: CachedProviderModels = {
                providerId: provider.id,
                fetchedAt,
                expiresAt,
                expiresAtEpochMs,
                models: liveModels,
            };
            this.cache.set(cacheKey, payload);
            return {
                providerId: payload.providerId,
                fetchedAt: payload.fetchedAt,
                expiresAt: payload.expiresAt,
                models: payload.models,
            };
        } catch (error) {
            console.error(
                `[agentchat-server] failed to fetch live models for provider ${provider.id}; falling back to config metadata`,
                error,
            );
            return buildFallbackModels(provider);
        }
    }

    async probeProviderModels(
        providerId: string,
    ): Promise<ProviderModelsProbe> {
        const resolvedProvider = getProviderConfig(
            this.getConfig(),
            providerId,
        );
        const provider = resolvedProvider?.enabled ? resolvedProvider : null;
        if (!provider) {
            return {
                providerId,
                ok: false,
                modelCount: 0,
                error: "Provider not found or not enabled.",
            };
        }

        try {
            const models = assertLiveModelsAvailable(
                await this.fetchLiveModels(provider),
            );
            return {
                providerId: provider.id,
                ok: true,
                modelCount: models.length,
                error: null,
            };
        } catch (error) {
            return {
                providerId: provider.id,
                ok: false,
                modelCount: 0,
                error:
                    error instanceof Error
                        ? error.message
                        : "Failed to reach Codex provider.",
            };
        }
    }

    private async fetchLiveModels(
        provider: ProviderConfig,
    ): Promise<ProviderModelCatalogEntry[]> {
        return await this.runtimeKinds.get(provider.kind).listModels({
            provider,
            agent: toBootstrapAgent(provider),
        });
    }
}
