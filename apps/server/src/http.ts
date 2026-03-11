import type { AgentchatConfig, AgentConfig, ProviderConfig } from "./config.ts";

type HandlerDependencies = {
    getConfig(): AgentchatConfig;
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

function getVisibleAgents(config: AgentchatConfig) {
    return config.agents
        .filter((agent) => agent.enabled)
        .sort((a, b) => a.sortOrder - b.sortOrder);
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
        defaultProviderId: agent.defaultProviderId,
        defaultModel: agent.defaultModel ?? null,
        defaultVariant: agent.defaultVariant ?? null,
        modelAllowlist: agent.modelAllowlist,
        variantAllowlist: agent.variantAllowlist,
    };
}

// TODO: replace placeholder model metadata with live Codex-backed fetch + in-memory cache.
function getProviderModels(config: AgentchatConfig, providerId: string) {
    const provider = resolveProvider(config, providerId);
    if (!provider) return null;

    return {
        providerId: provider.id,
        fetchedAt: null,
        expiresAt: null,
        models: [],
    };
}

export function createFetchHandler(deps: HandlerDependencies) {
    return async function fetch(request: Request): Promise<Response> {
        const config = deps.getConfig();
        const url = new URL(request.url);
        const pathname = url.pathname;

        if (request.method === "GET" && pathname === "/health") {
            return jsonResponse({
                ok: true,
                configVersion: config.version,
            });
        }

        if (request.method === "GET" && pathname === "/api/bootstrap") {
            return jsonResponse({
                auth: {
                    allowlistMode: config.auth.allowlistMode,
                },
                providers: getVisibleProviders(config).map(toProviderSummary),
                agents: getVisibleAgents(config).map(toAgentSummary),
                capabilities: {
                    transport: "http+websocket",
                    providers: ["codex"],
                    attachments: false,
                    autoApprove: true,
                },
            });
        }

        const providerModelsMatch = pathname.match(
            /^\/api\/providers\/([^/]+)\/models$/,
        );
        if (request.method === "GET" && providerModelsMatch) {
            const result = getProviderModels(
                config,
                decodeURIComponent(providerModelsMatch[1] ?? ""),
            );
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
