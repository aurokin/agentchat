import type { AgentConfig, AgentchatConfig, ProviderConfig } from "./config.ts";
import {
    CodexAppServerClient,
    type CodexClient,
    type CreateCodexClient,
} from "./codexAppServerClient.ts";

type CodexModelListResponse = {
    data?: Array<{
        id?: string;
        displayName?: string;
        hidden?: boolean;
        supportedReasoningEfforts?: Array<{
            reasoningEffort?: string;
        }>;
        defaultReasoningEffort?: string;
    }>;
    nextCursor?: string | null;
};

export type ProviderModelCatalogEntry = {
    id: string;
    label: string;
    supportsReasoning: boolean;
    variants: Array<{
        id: string;
        label: string;
    }>;
};

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

function toTitleCase(value: string): string {
    return value
        .split(/[-_]/g)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
}

function mapCodexEffortToVariant(
    effort: string,
): { id: string; label: string } | null {
    if (effort === "none") {
        return null;
    }

    switch (effort) {
        case "xhigh":
            return { id: effort, label: "X-High" };
        default:
            return {
                id: effort,
                label: toTitleCase(effort),
            };
    }
}

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
    return {
        id: "__agentchat_provider_models__",
        name: "Agentchat Provider Models",
        enabled: true,
        defaultVisible: true,
        visibilityOverrides: [],
        rootPath: provider.codex.cwd ?? process.cwd(),
        providerIds: [provider.id],
        defaultProviderId: provider.id,
        modelAllowlist: [],
        variantAllowlist: [],
        tags: [],
        sortOrder: 0,
        workspaceMode: "shared",
    };
}

function normalizeLiveModels(
    result: CodexModelListResponse,
): ProviderModelCatalogEntry[] {
    const items = result.data ?? [];

    return items
        .filter((item) => item.hidden !== true && typeof item.id === "string")
        .map((item) => {
            const seenVariantIds = new Set<string>();
            const variants =
                item.supportedReasoningEfforts
                    ?.map((effortOption) =>
                        mapCodexEffortToVariant(
                            effortOption.reasoningEffort ?? "",
                        ),
                    )
                    .filter(
                        (variant): variant is { id: string; label: string } => {
                            if (!variant) {
                                return false;
                            }
                            if (seenVariantIds.has(variant.id)) {
                                return false;
                            }
                            seenVariantIds.add(variant.id);
                            return true;
                        },
                    ) ?? [];

            return {
                id: item.id!,
                label:
                    typeof item.displayName === "string" &&
                    item.displayName.length > 0
                        ? item.displayName
                        : item.id!,
                supportsReasoning: variants.length > 0,
                variants,
            };
        });
}

export class CodexModelCatalog {
    private readonly getConfig: () => AgentchatConfig;
    private readonly createClient: CreateCodexClient;
    private readonly now: () => number;
    private readonly cache = new Map<string, CachedProviderModels>();

    constructor(params: {
        getConfig: () => AgentchatConfig;
        createClient?: CreateCodexClient;
        now?: () => number;
    }) {
        this.getConfig = params.getConfig;
        this.createClient =
            params.createClient ??
            ((clientParams) => new CodexAppServerClient(clientParams));
        this.now = params.now ?? (() => Date.now());
    }

    async getProviderModels(
        providerId: string,
    ): Promise<ProviderModelsPayload | null> {
        const provider =
            this.getConfig().providers.find(
                (candidate) => candidate.id === providerId && candidate.enabled,
            ) ?? null;
        if (!provider) {
            return null;
        }

        const now = this.now();
        const cached = this.cache.get(provider.id);
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
            this.cache.set(provider.id, payload);
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
        const provider =
            this.getConfig().providers.find(
                (candidate) => candidate.id === providerId && candidate.enabled,
            ) ?? null;
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
        const client = this.createClient({
            provider,
            agent: toBootstrapAgent(provider),
        });

        try {
            await client.initialize();

            const items: ProviderModelCatalogEntry[] = [];
            let cursor: string | null = null;

            do {
                const result = (await client.request("model/list", {
                    limit: 100,
                    cursor,
                    includeHidden: false,
                })) as CodexModelListResponse;

                items.push(...normalizeLiveModels(result));
                cursor = result.nextCursor ?? null;
            } while (cursor);

            return items;
        } finally {
            await client.stop();
        }
    }
}
