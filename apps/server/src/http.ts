import type { AgentchatConfig, AgentConfig, ProviderConfig } from "./config.ts";
import type { CodexModelCatalog } from "./codexModelCatalog.ts";
import {
    getConfigDiagnostics,
    getVisibleAgents,
    resolveAgentDefaults,
} from "./configDiagnostics.ts";
import { getRuntimeEnvDiagnostics } from "./envDiagnostics.ts";

type HandlerDependencies = {
    getConfig(): AgentchatConfig;
    modelCatalog?: Pick<CodexModelCatalog, "getProviderModels">;
};

function jsonResponse(body: unknown, init?: ResponseInit): Response {
    return Response.json(body, {
        ...init,
        headers: {
            "cache-control": "no-store",
            ...(init?.headers ?? {}),
        },
    });
}

function toProviderSummary(provider: ProviderConfig) {
    return {
        id: provider.id,
        kind: provider.kind,
        label: provider.label,
        enabled: provider.enabled,
    };
}

function toAgentSummary(agent: AgentConfig) {
    return {
        id: agent.id,
        name: agent.name,
        description: agent.description ?? null,
        avatar: agent.avatar ?? null,
        enabled: agent.enabled,
        providerIds: agent.providerIds,
        defaultProviderId: agent.defaultProviderId,
        defaultModel: agent.defaultModel ?? null,
        defaultVariant: agent.defaultVariant ?? null,
        tags: agent.tags,
        sortOrder: agent.sortOrder,
    };
}

function getVisibleProviders(config: AgentchatConfig) {
    return config.providers.filter((provider) => provider.enabled);
}

function resolveAgent(
    config: AgentchatConfig,
    agentId: string,
): AgentConfig | null {
    return (
        config.agents.find((agent) => agent.id === agentId && agent.enabled) ??
        null
    );
}

function resolveProvider(
    config: AgentchatConfig,
    providerId: string,
): ProviderConfig | null {
    return (
        config.providers.find(
            (provider) => provider.id === providerId && provider.enabled,
        ) ?? null
    );
}

function getAgentOptions(config: AgentchatConfig, agentId: string) {
    const agent = resolveAgent(config, agentId);
    if (!agent) return null;

    const resolvedDefaults = resolveAgentDefaults(config, agent);
    if (resolvedDefaults.allowedProviders.length === 0) {
        return null;
    }

    const providers = agent.providerIds
        .map((providerId) => resolveProvider(config, providerId))
        .filter((provider): provider is ProviderConfig => provider !== null)
        .map((provider) => ({
            id: provider.id,
            kind: provider.kind,
            label: provider.label,
        }));

    return {
        agentId: agent.id,
        allowedProviders: providers,
        defaultProviderId: resolvedDefaults.defaultProviderId,
        defaultModel: resolvedDefaults.defaultModel,
        defaultVariant: resolvedDefaults.defaultVariant,
        modelAllowlist: agent.modelAllowlist,
        variantAllowlist: agent.variantAllowlist,
    };
}

function getProviderModelsFallback(
    config: AgentchatConfig,
    providerId: string,
) {
    const provider = resolveProvider(config, providerId);
    if (!provider) return null;

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

export function createFetchHandler(deps: HandlerDependencies) {
    return async function fetch(request: Request): Promise<Response> {
        const config = deps.getConfig();
        const url = new URL(request.url);
        const pathname = url.pathname;

        if (request.method === "GET" && pathname === "/health") {
            const diagnostics = getConfigDiagnostics(config);
            return jsonResponse({
                ok: diagnostics.ok,
                configVersion: config.version,
                summary: diagnostics.summary,
            });
        }

        if (request.method === "GET" && pathname === "/api/diagnostics") {
            return jsonResponse({
                ...getConfigDiagnostics(config),
                runtimeEnv: getRuntimeEnvDiagnostics(),
            });
        }

        if (request.method === "GET" && pathname === "/api/bootstrap") {
            return jsonResponse({
                auth: {
                    allowlistMode: config.auth.allowlistMode,
                },
                providers: getVisibleProviders(config).map(toProviderSummary),
                agents: getVisibleAgents(config).map((agent) => {
                    const resolvedDefaults = resolveAgentDefaults(
                        config,
                        agent,
                    );
                    return {
                        ...toAgentSummary(agent),
                        defaultProviderId: resolvedDefaults.defaultProviderId,
                        defaultModel: resolvedDefaults.defaultModel,
                        defaultVariant: resolvedDefaults.defaultVariant,
                    };
                }),
                capabilities: {
                    transport: "http+websocket",
                    providers: ["codex"],
                    autoApprove: true,
                },
            });
        }

        const providerModelsMatch = pathname.match(
            /^\/api\/providers\/([^/]+)\/models$/,
        );
        if (request.method === "GET" && providerModelsMatch) {
            const providerId = decodeURIComponent(providerModelsMatch[1] ?? "");
            const result =
                (await deps.modelCatalog?.getProviderModels(providerId)) ??
                getProviderModelsFallback(config, providerId);
            if (!result) {
                return jsonResponse(
                    { error: "Provider not found" },
                    { status: 404 },
                );
            }
            return jsonResponse(result);
        }

        const agentOptionsMatch = pathname.match(
            /^\/api\/agents\/([^/]+)\/options$/,
        );
        if (request.method === "GET" && agentOptionsMatch) {
            const result = getAgentOptions(
                config,
                decodeURIComponent(agentOptionsMatch[1] ?? ""),
            );
            if (!result) {
                return jsonResponse(
                    { error: "Agent not found" },
                    { status: 404 },
                );
            }
            return jsonResponse(result);
        }

        return jsonResponse({ error: "Not found" }, { status: 404 });
    };
}
