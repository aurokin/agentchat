import { type OpenRouterModel, SupportedParameter } from "@/lib/types";
import { APP_DEFAULT_MODEL } from "@shared/core/models";

type BootstrapProvider = {
    id: string;
    kind: string;
    label: string;
    enabled: boolean;
};

type BootstrapResponse = {
    providers: BootstrapProvider[];
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

export function getAgentchatServerUrl(): string | null {
    const value = process.env.NEXT_PUBLIC_AGENTCHAT_SERVER_URL?.trim();
    if (!value) return null;
    return trimTrailingSlash(value);
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

export async function fetchAvailableModels(): Promise<OpenRouterModel[]> {
    const bootstrap = await fetchBootstrap();
    const visibleProviders = bootstrap.providers.filter(
        (provider) => provider.enabled,
    );

    const responses = await Promise.all(
        visibleProviders.map(async (provider) => {
            const payload = await fetchProviderModels(provider.id);
            return payload.models.map<OpenRouterModel>((model) => ({
                id: model.id,
                name: model.label,
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
