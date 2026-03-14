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
    const otherModels = models
        .filter((model) => !favoriteSet.has(model.id))
        .sort((a, b) => a.name.localeCompare(b.name));
    return { favoriteModelList, otherModels };
}
