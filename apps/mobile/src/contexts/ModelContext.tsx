import React, {
    createContext,
    useContext,
    useState,
    useCallback,
    useEffect,
    useMemo,
    type ReactNode,
} from "react";
import {
    modelSupportsReasoning as providerSupportsReasoning,
    modelSupportsVision as providerSupportsVision,
    type ProviderModel,
} from "@shared/core/models";
import {
    getDefaultProviderForAgent,
    getDefaultModelForAgent,
    getDefaultVariantForAgent,
    getFavoriteModels,
    setDefaultProviderForAgent,
    setDefaultModelForAgent,
    setDefaultVariantForAgent,
    setFavoriteModels,
} from "@/lib/storage";
import { fetchAvailableModels } from "@/lib/agentchat-server";
import { useAgent } from "@/contexts/AgentContext";
import {
    filterModelsForProvider,
    filterModelsForAgent,
    getVariantsForModel,
    getProviderIdForModel,
    selectScopedDefaultProvider,
    selectScopedDefaultModel,
    selectScopedDefaultVariant,
} from "@/contexts/settings-helpers";

export interface AvailableProviderOption {
    id: string;
    label: string;
}

interface ModelContextValue {
    models: ProviderModel[];
    isLoading: boolean;
    error: string | null;
    defaultAgentId: string | null;
    availableProviders: AvailableProviderOption[];
    selectedProviderId: string | null;
    selectProvider: (providerId: string) => Promise<void>;
    selectedModel: string | null;
    selectModel: (modelId: string) => Promise<void>;
    availableVariants: Array<{
        id: string;
        label: string;
    }>;
    selectedVariantId: string | null;
    selectVariant: (variantId: string) => Promise<void>;
    refreshModels: () => Promise<void>;
    favoriteModels: string[];
    toggleFavoriteModel: (modelId: string) => void;
}

const ModelContext = createContext<ModelContextValue | null>(null);

export function useModelContext(): ModelContextValue {
    const context = useContext(ModelContext);
    if (!context) {
        throw new Error("useModelContext must be used within ModelProvider");
    }
    return context;
}

interface ModelProviderProps {
    children: ReactNode;
}

export function ModelProvider({
    children,
}: ModelProviderProps): React.ReactElement {
    const [allModels, setAllModels] = useState<ProviderModel[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedProviderId, setSelectedProviderId] = useState<string | null>(
        null,
    );
    const [selectedModel, setSelectedModel] = useState<string | null>(null);
    const [selectedVariantId, setSelectedVariantId] = useState<string | null>(
        null,
    );
    const [favoriteModels, setFavoriteModelsState] = useState<string[]>([]);
    const [hasLoadedSelectedProvider, setHasLoadedSelectedProvider] =
        useState(false);
    const [hasLoadedSelectedModel, setHasLoadedSelectedModel] = useState(false);
    const [hasLoadedSelectedVariant, setHasLoadedSelectedVariant] =
        useState(false);
    const { selectedAgentId, selectedAgent, selectedAgentOptions } = useAgent();

    const agentModels = useMemo(
        () =>
            filterModelsForAgent({
                models: allModels,
                selectedAgent,
                selectedAgentOptions,
            }),
        [allModels, selectedAgent, selectedAgentOptions],
    );

    const availableProviders = useMemo<AvailableProviderOption[]>(() => {
        const allowedProviders = selectedAgentOptions?.allowedProviders ?? [];
        if (allowedProviders.length > 0) {
            return allowedProviders.filter((provider) =>
                agentModels.some(
                    (model) => getProviderIdForModel(model) === provider.id,
                ),
            );
        }

        return Array.from(
            new Map(
                agentModels.map((model) => [
                    getProviderIdForModel(model),
                    {
                        id: getProviderIdForModel(model),
                        label: model.provider ?? getProviderIdForModel(model),
                    },
                ]),
            ).values(),
        );
    }, [agentModels, selectedAgentOptions?.allowedProviders]);

    const models = useMemo(
        () =>
            filterModelsForProvider({
                models: agentModels,
                providerId: selectedProviderId,
            }),
        [agentModels, selectedProviderId],
    );
    const selectedModelEntry = useMemo(
        () => agentModels.find((model) => model.id === selectedModel) ?? null,
        [agentModels, selectedModel],
    );
    const availableVariants = useMemo(
        () => getVariantsForModel(selectedModelEntry),
        [selectedModelEntry],
    );

    const loadSelectedProvider = useCallback(async () => {
        try {
            const providerId =
                await getDefaultProviderForAgent(selectedAgentId);
            if (providerId) {
                setSelectedProviderId(providerId);
            }
        } catch {
            console.error("Failed to load selected provider");
        } finally {
            setHasLoadedSelectedProvider(true);
        }
    }, [selectedAgentId]);

    const loadSelectedModel = useCallback(async () => {
        try {
            const modelId = await getDefaultModelForAgent(selectedAgentId);
            if (modelId) {
                setSelectedModel(modelId);
            }
        } catch {
            console.error("Failed to load selected model");
        } finally {
            setHasLoadedSelectedModel(true);
        }
    }, [selectedAgentId]);

    const loadSelectedVariant = useCallback(async () => {
        try {
            const variantId = await getDefaultVariantForAgent(selectedAgentId);
            if (variantId) {
                setSelectedVariantId(variantId);
            } else {
                setSelectedVariantId(null);
            }
        } catch {
            console.error("Failed to load selected variant");
        } finally {
            setHasLoadedSelectedVariant(true);
        }
    }, [selectedAgentId]);

    const loadFavoriteModels = useCallback(async () => {
        try {
            const storedFavorites = await getFavoriteModels();
            setFavoriteModelsState(storedFavorites);
        } catch {
            console.error("Failed to load favorite models");
        }
    }, []);

    const refreshModels = useCallback(async () => {
        setIsLoading(true);
        setError(null);

        try {
            const fetchedModels = await fetchAvailableModels();
            setAllModels(fetchedModels);
        } catch (err) {
            const message =
                err instanceof Error ? err.message : "Failed to fetch models";
            setError(message);
        } finally {
            setIsLoading(false);
        }
    }, []);

    const selectProvider = useCallback(
        async (providerId: string) => {
            const providerModels = filterModelsForProvider({
                models: agentModels,
                providerId,
            });
            if (providerModels.length === 0) {
                return;
            }

            try {
                await setDefaultProviderForAgent(providerId, selectedAgentId);
                setSelectedProviderId(providerId);

                if (
                    !providerModels.some((model) => model.id === selectedModel)
                ) {
                    const nextModel = selectScopedDefaultModel({
                        models: providerModels,
                        userPreferredModel: null,
                        agentDefaultModel:
                            selectedAgentOptions?.defaultModel ??
                            selectedAgent?.defaultModel ??
                            null,
                    });

                    if (nextModel) {
                        await setDefaultModelForAgent(
                            nextModel,
                            selectedAgentId,
                        );
                        setSelectedModel(nextModel);

                        const nextModelEntry =
                            providerModels.find(
                                (model) => model.id === nextModel,
                            ) ?? null;
                        const nextVariantId = selectScopedDefaultVariant({
                            model: nextModelEntry,
                            userPreferredVariantId: null,
                            agentDefaultVariantId:
                                selectedAgentOptions?.defaultVariant ??
                                selectedAgent?.defaultVariant ??
                                null,
                        });
                        if (nextVariantId) {
                            await setDefaultVariantForAgent(
                                nextVariantId,
                                selectedAgentId,
                            );
                        }
                        setSelectedVariantId(nextVariantId);
                    }
                }
            } catch {
                console.error("Failed to save selected provider");
            }
        },
        [
            agentModels,
            selectedAgent?.defaultVariant,
            selectedAgent?.defaultModel,
            selectedAgentId,
            selectedAgentOptions?.defaultVariant,
            selectedAgentOptions?.defaultModel,
            selectedModel,
        ],
    );

    const selectModel = useCallback(
        async (modelId: string) => {
            try {
                await setDefaultModelForAgent(modelId, selectedAgentId);
                setSelectedModel(modelId);

                const nextModelEntry =
                    agentModels.find((entry) => entry.id === modelId) ?? null;
                const providerId = nextModelEntry
                    ? getProviderIdForModel(nextModelEntry)
                    : null;
                if (providerId) {
                    await setDefaultProviderForAgent(
                        providerId,
                        selectedAgentId,
                    );
                    setSelectedProviderId(providerId);
                }

                const nextVariantId = selectScopedDefaultVariant({
                    model: nextModelEntry,
                    userPreferredVariantId: selectedVariantId,
                    agentDefaultVariantId:
                        selectedAgentOptions?.defaultVariant ??
                        selectedAgent?.defaultVariant ??
                        null,
                });

                if (nextVariantId) {
                    await setDefaultVariantForAgent(
                        nextVariantId,
                        selectedAgentId,
                    );
                }
                setSelectedVariantId(nextVariantId);
            } catch {
                console.error("Failed to save selected model");
            }
        },
        [
            agentModels,
            selectedAgent?.defaultVariant,
            selectedAgentId,
            selectedAgentOptions?.defaultVariant,
            selectedVariantId,
        ],
    );

    const selectVariant = useCallback(
        async (variantId: string) => {
            const availableVariantIds = availableVariants.map(
                (variant) => variant.id,
            );
            if (!availableVariantIds.includes(variantId)) {
                return;
            }

            try {
                await setDefaultVariantForAgent(variantId, selectedAgentId);
                setSelectedVariantId(variantId);
            } catch {
                console.error("Failed to save selected variant");
            }
        },
        [availableVariants, selectedAgentId],
    );

    const toggleFavoriteModel = useCallback((modelId: string) => {
        setFavoriteModelsState((prev) => {
            const isFavorite = prev.includes(modelId);
            const nextFavorites = isFavorite
                ? prev.filter((id) => id !== modelId)
                : [...prev, modelId];
            void setFavoriteModels(nextFavorites);
            return nextFavorites;
        });
    }, []);

    useEffect(() => {
        loadSelectedProvider();
        loadSelectedModel();
        loadSelectedVariant();
        loadFavoriteModels();
    }, [
        loadFavoriteModels,
        loadSelectedModel,
        loadSelectedProvider,
        loadSelectedVariant,
    ]);

    useEffect(() => {
        if (
            hasLoadedSelectedModel &&
            hasLoadedSelectedProvider &&
            hasLoadedSelectedVariant
        ) {
            refreshModels();
        }
    }, [
        hasLoadedSelectedModel,
        hasLoadedSelectedProvider,
        hasLoadedSelectedVariant,
        refreshModels,
    ]);

    useEffect(() => {
        if (
            !hasLoadedSelectedModel ||
            !hasLoadedSelectedProvider ||
            !hasLoadedSelectedVariant
        ) {
            return;
        }

        const nextSelectedProvider = selectScopedDefaultProvider({
            models: agentModels,
            userPreferredProviderId: selectedProviderId,
            selectedModelId: selectedModel,
            agentDefaultProviderId:
                selectedAgentOptions?.defaultProviderId ??
                selectedAgent?.defaultProviderId ??
                null,
        });

        if (
            nextSelectedProvider &&
            nextSelectedProvider !== selectedProviderId
        ) {
            setSelectedProviderId(nextSelectedProvider);
            void setDefaultProviderForAgent(
                nextSelectedProvider,
                selectedAgentId,
            );
            return;
        }

        const nextSelectedVariant = selectScopedDefaultVariant({
            model: selectedModelEntry,
            userPreferredVariantId: selectedVariantId,
            agentDefaultVariantId:
                selectedAgentOptions?.defaultVariant ??
                selectedAgent?.defaultVariant ??
                null,
        });

        if (nextSelectedVariant !== selectedVariantId) {
            setSelectedVariantId(nextSelectedVariant);
            if (nextSelectedVariant) {
                void setDefaultVariantForAgent(
                    nextSelectedVariant,
                    selectedAgentId,
                );
            }
            return;
        }

        const nextSelectedModel = selectScopedDefaultModel({
            models,
            userPreferredModel: selectedModel,
            agentDefaultModel:
                selectedAgentOptions?.defaultModel ??
                selectedAgent?.defaultModel ??
                null,
        });

        if (!nextSelectedModel || nextSelectedModel === selectedModel) {
            return;
        }

        setSelectedModel(nextSelectedModel);
        void setDefaultModelForAgent(nextSelectedModel, selectedAgentId);
    }, [
        agentModels,
        hasLoadedSelectedProvider,
        hasLoadedSelectedModel,
        hasLoadedSelectedVariant,
        models,
        selectedAgent?.defaultVariant,
        selectedAgent?.defaultProviderId,
        selectedAgent?.defaultModel,
        selectedAgentId,
        selectedAgentOptions?.defaultVariant,
        selectedAgentOptions?.defaultProviderId,
        selectedAgentOptions?.defaultModel,
        selectedProviderId,
        selectedModel,
        selectedModelEntry,
        selectedVariantId,
    ]);

    return (
        <ModelContext.Provider
            value={{
                models,
                isLoading,
                error,
                defaultAgentId: selectedAgentId,
                availableProviders,
                selectedProviderId,
                selectProvider,
                selectedModel,
                selectModel,
                availableVariants,
                selectedVariantId,
                selectVariant,
                refreshModels,
                favoriteModels,
                toggleFavoriteModel,
            }}
        >
            {children}
        </ModelContext.Provider>
    );
}

export function modelSupportsVision(
    modelId: string,
    models: ProviderModel[],
): boolean {
    const model = models.find((m) => m.id === modelId);
    return providerSupportsVision(model);
}

export function modelSupportsReasoning(
    modelId: string,
    models: ProviderModel[],
): boolean {
    const model = models.find((m) => m.id === modelId);
    return providerSupportsReasoning(model);
}
