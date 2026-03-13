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
    getDefaultModelForAgent,
    getFavoriteModels,
    setDefaultModelForAgent,
    setFavoriteModels,
} from "@/lib/storage";
import { fetchAvailableModels } from "@/lib/agentchat-server";
import { useAgent } from "@/contexts/AgentContext";
import {
    filterModelsForAgent,
    selectScopedDefaultModel,
} from "@/contexts/settings-helpers";

interface ModelContextValue {
    models: ProviderModel[];
    isLoading: boolean;
    error: string | null;
    defaultAgentId: string | null;
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
    const [selectedModel, setSelectedModel] = useState<string | null>(null);
    const [favoriteModels, setFavoriteModelsState] = useState<string[]>([]);
    const [hasLoadedSelectedModel, setHasLoadedSelectedModel] = useState(false);
    const { selectedAgentId, selectedAgent, selectedAgentOptions } = useAgent();

    const models = useMemo(
        () =>
            filterModelsForAgent({
                models: allModels,
                selectedAgent,
                selectedAgentOptions,
            }),
        [allModels, selectedAgent, selectedAgentOptions],
    );

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

    const selectModel = useCallback(
        async (modelId: string) => {
            try {
                await setDefaultModelForAgent(modelId, selectedAgentId);
                setSelectedModel(modelId);
            } catch {
                console.error("Failed to save selected model");
            }
        },
        [selectedAgentId],
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
        loadSelectedModel();
        loadFavoriteModels();
    }, [loadSelectedModel, loadFavoriteModels]);

    useEffect(() => {
        if (hasLoadedSelectedModel) {
            refreshModels();
        }
    }, [hasLoadedSelectedModel, refreshModels]);

    useEffect(() => {
        if (!hasLoadedSelectedModel) {
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
        hasLoadedSelectedModel,
        models,
        selectedAgent?.defaultModel,
        selectedAgentId,
        selectedAgentOptions?.defaultModel,
        selectedModel,
    ]);

    return (
        <ModelContext.Provider
            value={{
                models,
                isLoading,
                error,
                defaultAgentId: selectedAgentId,
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
