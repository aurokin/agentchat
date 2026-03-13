import type { ProviderModel } from "@shared/core/models";

export function filterModels(
    models: ProviderModel[],
    query: string,
): ProviderModel[] {
    if (!query.trim()) return models;
    const normalizedQuery = query.toLowerCase();
    return models.filter(
        (model) =>
            model.id.toLowerCase().includes(normalizedQuery) ||
            model.name.toLowerCase().includes(normalizedQuery) ||
            model.provider?.toLowerCase().includes(normalizedQuery),
    );
}

export function splitFavoriteModels(
    models: ProviderModel[],
    favoriteModelIds: string[],
): {
    favoriteModelList: ProviderModel[];
    otherModels: ProviderModel[];
} {
    const favoriteSet = new Set(favoriteModelIds);
    const favoriteModelList = models
        .filter((model) => favoriteSet.has(model.id))
        .sort((a, b) => a.name.localeCompare(b.name));
    const otherModels = models.filter((model) => !favoriteSet.has(model.id));
    return { favoriteModelList, otherModels };
}

export function getProviderFromModelId(modelId: string): string {
    const parts = modelId.split("/");
    return parts.length > 1 && parts[0] ? parts[0] : "other";
}

export function groupModelsByProvider(
    models: ProviderModel[],
): Record<string, ProviderModel[]> {
    return models.reduce(
        (acc, model) => {
            const provider = getProviderFromModelId(model.id);
            if (!acc[provider]) {
                acc[provider] = [];
            }
            acc[provider].push(model);
            return acc;
        },
        {} as Record<string, ProviderModel[]>,
    );
}

export function getProviderOrder(models: ProviderModel[]): string[] {
    const order: string[] = [];
    const seen = new Set<string>();

    for (const model of models) {
        const provider = getProviderFromModelId(model.id);
        if (!seen.has(provider)) {
            seen.add(provider);
            order.push(provider);
        }
    }

    return order;
}
