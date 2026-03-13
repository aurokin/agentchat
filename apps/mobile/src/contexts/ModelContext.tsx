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
    getFavoriteModels,
    setDefaultProviderForAgent,
    setDefaultModelForAgent,
    setFavoriteModels,
} from "@/lib/storage";
import { fetchAvailableModels } from "@/lib/agentchat-server";
import { useAgent } from "@/contexts/AgentContext";
import {
    filterModelsForProvider,
    filterModelsForAgent,
    getProviderIdForModel,
    selectScopedDefaultProvider,
    selectScopedDefaultModel,
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
    const [favoriteModels, setFavoriteModelsState] = useState<string[]>([]);
    const [hasLoadedSelectedProvider, setHasLoadedSelectedProvider] =
        useState(false);
    const [hasLoadedSelectedModel, setHasLoadedSelectedModel] = useState(false);
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
                    }
                }
            } catch {
                console.error("Failed to save selected provider");
            }
        },
        [
            agentModels,
            selectedAgent?.defaultModel,
            selectedAgentId,
            selectedAgentOptions?.defaultModel,
            selectedModel,
        ],
    );

    const selectModel = useCallback(
        async (modelId: string) => {
            try {
                await setDefaultModelForAgent(modelId, selectedAgentId);
                setSelectedModel(modelId);

                const model = agentModels.find((entry) => entry.id === modelId);
                const providerId = model ? getProviderIdForModel(model) : null;
                if (providerId) {
                    await setDefaultProviderForAgent(
                        providerId,
                        selectedAgentId,
                    );
                    setSelectedProviderId(providerId);
                }
            } catch {
                console.error("Failed to save selected model");
            }
        },
        [agentModels, selectedAgentId],
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
        loadFavoriteModels();
    }, [loadSelectedProvider, loadSelectedModel, loadFavoriteModels]);

    useEffect(() => {
        if (hasLoadedSelectedModel && hasLoadedSelectedProvider) {
            refreshModels();
        }
    }, [hasLoadedSelectedModel, hasLoadedSelectedProvider, refreshModels]);

    useEffect(() => {
        if (!hasLoadedSelectedModel || !hasLoadedSelectedProvider) {
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
        models,
        selectedAgent?.defaultProviderId,
        selectedAgent?.defaultModel,
        selectedAgentId,
        selectedAgentOptions?.defaultProviderId,
        selectedAgentOptions?.defaultModel,
        selectedProviderId,
        selectedModel,
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
