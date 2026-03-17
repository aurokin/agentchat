import React, {
    createContext,
    useContext,
    useState,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    type ReactNode,
} from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import {
    modelSupportsReasoning as providerSupportsReasoning,
    modelSupportsVision as providerSupportsVision,
    type ProviderModel,
} from "@shared/core/models";
import { fetchAvailableModels } from "@/lib/agentchat-server";
import { useAgent } from "@/contexts/AgentContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
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
    syncSelectionFromChat: (params: {
        modelId: string;
        variantId: string | null;
    }) => void;
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
    const { isWorkspaceReady } = useWorkspace();
    const { selectedAgentId, selectedAgent, selectedAgentOptions } = useAgent();
    const preferences = useQuery(
        api.users.getPreferences,
        isWorkspaceReady ? {} : "skip",
    );
    const saveFavoriteModels = useMutation(api.users.setFavoriteModels);

    const agentDefaultProviderId =
        selectedAgentOptions?.defaultProviderId ??
        selectedAgent?.defaultProviderId ??
        null;
    const agentDefaultModel =
        selectedAgentOptions?.defaultModel ??
        selectedAgent?.defaultModel ??
        null;
    const agentDefaultVariantId =
        selectedAgentOptions?.defaultVariant ??
        selectedAgent?.defaultVariant ??
        null;

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

    const applySelection = useCallback(
        (params: { modelId: string | null; variantId: string | null }) => {
            const modelEntry =
                agentModels.find((model) => model.id === params.modelId) ??
                null;
            setSelectedModel(params.modelId);
            setSelectedProviderId(
                modelEntry ? getProviderIdForModel(modelEntry) : null,
            );
            setSelectedVariantId(
                selectScopedDefaultVariant({
                    model: modelEntry,
                    currentVariantId: params.variantId,
                    agentDefaultVariantId,
                }),
            );
        },
        [agentDefaultVariantId, agentModels],
    );

    const selectProvider = useCallback(
        async (providerId: string) => {
            const providerModels = filterModelsForProvider({
                models: agentModels,
                providerId,
            });
            if (providerModels.length === 0) {
                return;
            }

            setSelectedProviderId(providerId);

            if (providerModels.some((model) => model.id === selectedModel)) {
                return;
            }

            const nextModelId = selectScopedDefaultModel({
                models: providerModels,
                currentModelId: null,
                agentDefaultModel,
            });
            if (!nextModelId) {
                setSelectedModel(null);
                setSelectedVariantId(null);
                return;
            }

            const nextModelEntry =
                providerModels.find((model) => model.id === nextModelId) ??
                null;
            setSelectedModel(nextModelId);
            setSelectedVariantId(
                selectScopedDefaultVariant({
                    model: nextModelEntry,
                    currentVariantId: selectedVariantId,
                    agentDefaultVariantId,
                }),
            );
        },
        [
            agentDefaultModel,
            agentDefaultVariantId,
            agentModels,
            selectedModel,
            selectedVariantId,
        ],
    );

    const selectModel = useCallback(
        async (modelId: string) => {
            const nextModelEntry =
                agentModels.find((entry) => entry.id === modelId) ?? null;
            if (!nextModelEntry) {
                return;
            }

            setSelectedModel(modelId);
            setSelectedProviderId(getProviderIdForModel(nextModelEntry));
            setSelectedVariantId(
                selectScopedDefaultVariant({
                    model: nextModelEntry,
                    currentVariantId: selectedVariantId,
                    agentDefaultVariantId,
                }),
            );
        },
        [agentDefaultVariantId, agentModels, selectedVariantId],
    );

    const selectVariant = useCallback(
        async (variantId: string) => {
            const availableVariantIds = availableVariants.map(
                (variant) => variant.id,
            );
            if (!availableVariantIds.includes(variantId)) {
                return;
            }

            setSelectedVariantId(variantId);
        },
        [availableVariants],
    );

    const syncSelectionFromChat = useCallback(
        (params: { modelId: string; variantId: string | null }) => {
            applySelection(params);
        },
        [applySelection],
    );

    const toggleFavoriteModel = useCallback(
        (modelId: string) => {
            setFavoriteModelsState((prev) => {
                const isFavorite = prev.includes(modelId);
                const nextFavorites = isFavorite
                    ? prev.filter((id) => id !== modelId)
                    : [...prev, modelId];
                void saveFavoriteModels({ modelIds: nextFavorites }).catch(
                    (saveError) => {
                        console.error(
                            "Failed to save favorite models:",
                            saveError,
                        );
                    },
                );
                return nextFavorites;
            });
        },
        [saveFavoriteModels],
    );

    useEffect(() => {
        void refreshModels();
    }, [refreshModels]);

    useEffect(() => {
        if (preferences === undefined) {
            return;
        }
        setFavoriteModelsState(preferences.favoriteModelIds);
    }, [preferences]);

    const prevAgentIdRef = useRef(selectedAgentId);

    useEffect(() => {
        const agentChanged = prevAgentIdRef.current !== selectedAgentId;
        prevAgentIdRef.current = selectedAgentId;

        const nextSelectedModel = selectScopedDefaultModel({
            models,
            currentModelId: agentChanged ? null : selectedModel,
            agentDefaultModel,
        });
        const nextSelectedModelEntry =
            agentModels.find((model) => model.id === nextSelectedModel) ?? null;
        const nextSelectedProvider = selectScopedDefaultProvider({
            models: agentModels,
            currentProviderId: agentChanged ? null : selectedProviderId,
            selectedModelId: nextSelectedModel,
            agentDefaultProviderId,
        });
        const nextSelectedVariant = selectScopedDefaultVariant({
            model: nextSelectedModelEntry,
            currentVariantId: agentChanged ? null : selectedVariantId,
            agentDefaultVariantId,
        });

        if (nextSelectedProvider !== selectedProviderId) {
            setSelectedProviderId(nextSelectedProvider);
        }
        if (nextSelectedModel !== selectedModel) {
            setSelectedModel(nextSelectedModel);
        }
        if (nextSelectedVariant !== selectedVariantId) {
            setSelectedVariantId(nextSelectedVariant);
        }
    }, [
        agentDefaultModel,
        agentDefaultProviderId,
        agentDefaultVariantId,
        agentModels,
        models,
        selectedAgentId,
        selectedModel,
        selectedProviderId,
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
                syncSelectionFromChat,
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
