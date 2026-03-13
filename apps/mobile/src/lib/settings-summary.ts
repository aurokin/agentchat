import type { ProviderModel } from "@shared/core/models";
import type { BootstrapAgent } from "@/lib/agentchat-server";

export interface AgentSettingsSummary {
    agentName: string;
    agentDescription: string | null;
    providerLabel: string;
    modelLabel: string;
    variantLabel: string;
}

export function buildAgentSettingsSummary(params: {
    selectedAgent: BootstrapAgent | null;
    selectedProviderId: string | null;
    selectedModelId: string | null;
    selectedVariantId: string | null;
    models: ProviderModel[];
}): AgentSettingsSummary {
    const selectedModel =
        params.models.find((model) => model.id === params.selectedModelId) ??
        null;
    const selectedVariant =
        selectedModel?.variants?.find(
            (variant) => variant.id === params.selectedVariantId,
        ) ?? null;

    return {
        agentName: params.selectedAgent?.name ?? "No agent selected",
        agentDescription: params.selectedAgent?.description ?? null,
        providerLabel:
            selectedModel?.provider ??
            params.selectedProviderId ??
            "Server default",
        modelLabel:
            selectedModel?.name ?? params.selectedModelId ?? "Server default",
        variantLabel:
            selectedVariant?.label ??
            params.selectedVariantId ??
            "Server default",
    };
}
