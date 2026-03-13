import type {
    AgentOptionsResponse,
    BootstrapAgent,
} from "@/lib/agentchat-server";
import type { ProviderModel, ProviderVariant } from "@shared/core/models";
import { APP_DEFAULT_MODEL } from "@shared/core/models";

export function filterModelsForAgent(params: {
    models: ProviderModel[];
    selectedAgent: BootstrapAgent | null;
    selectedAgentOptions: AgentOptionsResponse | null;
}): ProviderModel[] {
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
    models: ProviderModel[];
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

export function getProviderIdForModel(model: ProviderModel): string {
    return model.providerId ?? model.id.split("/")[0] ?? "other";
}

export function filterModelsForProvider(params: {
    models: ProviderModel[];
    providerId: string | null;
}): ProviderModel[] {
    const { models, providerId } = params;
    if (!providerId) {
        return models;
    }

    return models.filter(
        (model) => getProviderIdForModel(model) === providerId,
    );
}

export function selectScopedDefaultVariant(params: {
    model: ProviderModel | null | undefined;
    userPreferredVariantId: string | null;
    agentDefaultVariantId: string | null;
}): string | null {
    const variants = params.model?.variants ?? [];
    const variantIds = variants.map((variant) => variant.id);

    if (variantIds.length === 0) {
        return null;
    }

    if (
        params.userPreferredVariantId &&
        variantIds.includes(params.userPreferredVariantId)
    ) {
        return params.userPreferredVariantId;
    }

    if (
        params.agentDefaultVariantId &&
        variantIds.includes(params.agentDefaultVariantId)
    ) {
        return params.agentDefaultVariantId;
    }

    return variants[0]?.id ?? null;
}

export function getVariantsForModel(
    model: ProviderModel | null | undefined,
): ProviderVariant[] {
    return model?.variants ?? [];
}

export function selectScopedDefaultProvider(params: {
    models: ProviderModel[];
    userPreferredProviderId: string | null;
    selectedModelId: string | null;
    agentDefaultProviderId: string | null;
}): string | null {
    const availableProviderIds = Array.from(
        new Set(params.models.map(getProviderIdForModel)),
    );

    if (availableProviderIds.length === 0) {
        return null;
    }

    if (params.selectedModelId) {
        const selectedModel = params.models.find(
            (model) => model.id === params.selectedModelId,
        );
        if (selectedModel) {
            return getProviderIdForModel(selectedModel);
        }
    }

    if (
        params.userPreferredProviderId &&
        availableProviderIds.includes(params.userPreferredProviderId)
    ) {
        return params.userPreferredProviderId;
    }

    if (
        params.agentDefaultProviderId &&
        availableProviderIds.includes(params.agentDefaultProviderId)
    ) {
        return params.agentDefaultProviderId;
    }

    return availableProviderIds[0] ?? null;
}
