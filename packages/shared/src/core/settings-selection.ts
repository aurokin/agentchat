import {
    APP_DEFAULT_MODEL,
    type ProviderModel,
    type ProviderVariant,
} from "./models";

type AgentProviderScope = {
    providerIds: string[];
};

type AgentOptionsScope = {
    allowedProviders?: Array<{
        id: string;
    }> | null;
    modelAllowlist?: string[] | null;
    variantAllowlist?: string[] | null;
};

export function filterModelsForAgent<Model extends ProviderModel>(params: {
    models: Model[];
    selectedAgent: AgentProviderScope | null;
    selectedAgentOptions: AgentOptionsScope | null;
}): Model[] {
    const { models, selectedAgent, selectedAgentOptions } = params;
    if (!selectedAgent) {
        return models;
    }

    const allowedProviderIds =
        selectedAgentOptions?.allowedProviders?.map(
            (provider) => provider.id,
        ) ?? selectedAgent.providerIds;
    const modelAllowlist = selectedAgentOptions?.modelAllowlist ?? [];
    const variantAllowlist = selectedAgentOptions?.variantAllowlist ?? [];

    return models
        .filter((model) =>
            allowedProviderIds.includes(getProviderIdForModel(model)),
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
        })) as Model[];
}

export function selectScopedDefaultModel(params: {
    models: ProviderModel[];
    currentModelId: string | null;
    agentDefaultModel: string | null;
}): string | null {
    const { models, currentModelId, agentDefaultModel } = params;
    const modelIds = models.map((model) => model.id);

    if (currentModelId && modelIds.includes(currentModelId)) {
        return currentModelId;
    }

    if (agentDefaultModel && modelIds.includes(agentDefaultModel)) {
        return agentDefaultModel;
    }

    if (modelIds.includes(APP_DEFAULT_MODEL)) {
        return APP_DEFAULT_MODEL;
    }

    return models[0]?.id ?? null;
}

export function getProviderIdForModel(
    model: Pick<ProviderModel, "id" | "providerId">,
): string {
    return model.providerId ?? model.id.split("/")[0] ?? "other";
}

export function filterModelsForProvider<Model extends ProviderModel>(params: {
    models: Model[];
    providerId: string | null;
}): Model[] {
    const { models, providerId } = params;
    if (!providerId) {
        return models;
    }

    return models.filter(
        (model) => getProviderIdForModel(model) === providerId,
    );
}

export function selectScopedDefaultVariant(params: {
    model: Pick<ProviderModel, "variants"> | null | undefined;
    currentVariantId: string | null;
    agentDefaultVariantId: string | null;
}): string | null {
    const variants = params.model?.variants ?? [];
    const variantIds = variants.map((variant) => variant.id);

    if (variantIds.length === 0) {
        return null;
    }

    if (
        params.currentVariantId &&
        variantIds.includes(params.currentVariantId)
    ) {
        return params.currentVariantId;
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
    model: Pick<ProviderModel, "variants"> | null | undefined,
): ProviderVariant[] {
    return model?.variants ?? [];
}

export function selectScopedDefaultProvider(params: {
    models: ProviderModel[];
    currentProviderId: string | null;
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
        params.currentProviderId &&
        availableProviderIds.includes(params.currentProviderId)
    ) {
        return params.currentProviderId;
    }

    if (
        params.agentDefaultProviderId &&
        availableProviderIds.includes(params.agentDefaultProviderId)
    ) {
        return params.agentDefaultProviderId;
    }

    return availableProviderIds[0] ?? null;
}
