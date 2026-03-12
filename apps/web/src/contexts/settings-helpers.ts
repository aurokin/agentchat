import type {
    AgentOptionsResponse,
    BootstrapAgent,
} from "@/lib/agentchat-server";
import type { OpenRouterModel } from "@/lib/types";
import { APP_DEFAULT_MODEL } from "@shared/core/models";

export function filterModelsForAgent(params: {
    models: OpenRouterModel[];
    selectedAgent: BootstrapAgent | null;
    selectedAgentOptions: AgentOptionsResponse | null;
}): OpenRouterModel[] {
    const { models, selectedAgent, selectedAgentOptions } = params;
    if (!selectedAgent) {
        return models;
    }

    const allowedProviderIds =
        selectedAgentOptions?.allowedProviders.map((provider) => provider.id) ??
        selectedAgent.providerIds;
    const modelAllowlist = selectedAgentOptions?.modelAllowlist ?? [];
    const variantAllowlist = selectedAgentOptions?.variantAllowlist ?? [];

    return models
        .filter((model) =>
            allowedProviderIds.includes(
                model.providerId ?? model.id.split("/")[0] ?? "",
            ),
        )
        .filter((model) =>
            modelAllowlist.length === 0
                ? true
                : modelAllowlist.includes(model.id),
        )
        .map((model) => ({
            ...model,
            variants:
                variantAllowlist.length === 0
                    ? model.variants
                    : (model.variants?.filter((variant) =>
                          variantAllowlist.includes(variant.id),
                      ) ?? []),
        }));
}

export function selectScopedDefaultModel(params: {
    models: OpenRouterModel[];
    userPreferredModel: string | null;
    agentDefaultModel: string | null;
}): string | null {
    const { models, userPreferredModel, agentDefaultModel } = params;
    const modelIds = models.map((model) => model.id);

    if (userPreferredModel && modelIds.includes(userPreferredModel)) {
        return userPreferredModel;
    }

    if (agentDefaultModel && modelIds.includes(agentDefaultModel)) {
        return agentDefaultModel;
    }

    if (modelIds.includes(APP_DEFAULT_MODEL)) {
        return APP_DEFAULT_MODEL;
    }

    return models[0]?.id ?? null;
}
