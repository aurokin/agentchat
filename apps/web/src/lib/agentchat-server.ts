import { type ProviderModel, SupportedParameter } from "@/lib/types";
import { APP_DEFAULT_MODEL } from "@shared/core/models";

type BootstrapProvider = {
    id: string;
    kind: string;
    label: string;
    enabled: boolean;
};

export type BootstrapAuthProvider = {
    id: string;
    kind: "google" | "local";
    enabled: boolean;
    allowlistMode: "email" | null;
    allowSignup: boolean | null;
};

export type BootstrapAgent = {
    id: string;
    name: string;
    description: string | null;
    avatar: string | null;
    enabled: boolean;
    providerIds: string[];
    defaultProviderId: string;
    defaultModel: string | null;
    defaultVariant: string | null;
    tags: string[];
    sortOrder: number;
};

export type BootstrapResponse = {
    auth: {
        defaultProviderId: string;
        requiresLogin: boolean;
        activeProvider: BootstrapAuthProvider | null;
        providers: BootstrapAuthProvider[];
    };
    providers: BootstrapProvider[];
    agents: BootstrapAgent[];
};

export type AgentOptionsResponse = {
    agentId: string;
    allowedProviders: Array<{
        id: string;
        kind: string;
        label: string;
    }>;
    defaultProviderId: string;
    defaultModel: string | null;
    defaultVariant: string | null;
    modelAllowlist: string[];
    variantAllowlist: string[];
};

type ProviderModelsResponse = {
    providerId: string;
    models: Array<{
        id: string;
        label: string;
        supportsReasoning: boolean;
        variants: Array<{
            id: string;
            label: string;
        }>;
    }>;
};

function trimTrailingSlash(value: string): string {
    return value.replace(/\/+$/, "");
}

function isLoopbackHostname(hostname: string): boolean {
    return (
        hostname === "localhost" ||
        hostname === "127.0.0.1" ||
        hostname === "::1"
    );
}

function resolveBrowserReachableUrl(configuredUrl: string): string {
    if (typeof window === "undefined") {
        return configuredUrl;
    }

    const browserHostname = window.location.hostname;
    if (!browserHostname || isLoopbackHostname(browserHostname)) {
        return configuredUrl;
    }

    let parsedUrl: URL;

    try {
        parsedUrl = new URL(configuredUrl);
    } catch {
        return configuredUrl;
    }

    if (!isLoopbackHostname(parsedUrl.hostname)) {
        return configuredUrl;
    }

    parsedUrl.hostname = browserHostname;
    return trimTrailingSlash(parsedUrl.toString());
}

export function getAgentchatServerUrl(): string | null {
    const value = process.env.NEXT_PUBLIC_AGENTCHAT_SERVER_URL?.trim();
    if (!value) return null;
    return resolveBrowserReachableUrl(trimTrailingSlash(value));
}

async function fetchJson<T>(path: string): Promise<T> {
    const baseUrl = getAgentchatServerUrl();
    if (!baseUrl) {
        throw new Error(
            "NEXT_PUBLIC_AGENTCHAT_SERVER_URL is not configured for the web app.",
        );
    }

    const response = await fetch(`${baseUrl}${path}`, {
        method: "GET",
        headers: {
            Accept: "application/json",
        },
        cache: "no-store",
    });

    if (!response.ok) {
        throw new Error(
            `Agentchat server request failed (${response.status}) for ${path}.`,
        );
    }

    return (await response.json()) as T;
}

export async function fetchBootstrap(): Promise<BootstrapResponse> {
    return await fetchJson<BootstrapResponse>("/api/bootstrap");
}

export async function fetchProviderModels(
    providerId: string,
): Promise<ProviderModelsResponse> {
    return await fetchJson<ProviderModelsResponse>(
        `/api/providers/${encodeURIComponent(providerId)}/models`,
    );
}

export async function fetchAgentOptions(
    agentId: string,
): Promise<AgentOptionsResponse> {
    return await fetchJson<AgentOptionsResponse>(
        `/api/agents/${encodeURIComponent(agentId)}/options`,
    );
}

export async function fetchAvailableModels(): Promise<ProviderModel[]> {
    const bootstrap = await fetchBootstrap();
    const visibleProviders = bootstrap.providers.filter(
        (provider) => provider.enabled,
    );

    const responses = await Promise.all(
        visibleProviders.map(async (provider) => {
            const payload = await fetchProviderModels(provider.id);
            return payload.models.map<ProviderModel>((model) => ({
                id: model.id,
                name: model.label,
                providerId: provider.id,
                provider: provider.label,
                supportedParameters: model.supportsReasoning
                    ? [SupportedParameter.Reasoning]
                    : [],
                variants: model.variants,
            }));
        }),
    );

    const models = responses.flat();
    const sorted = models.sort((a, b) => {
        if (a.id === APP_DEFAULT_MODEL) return -1;
        if (b.id === APP_DEFAULT_MODEL) return 1;
        return a.name.localeCompare(b.name);
    });

    return sorted;
}
