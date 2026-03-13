import React, {
    createContext,
    useContext,
    useState,
    useCallback,
    useEffect,
    type ReactNode,
} from "react";
import {
    APP_DEFAULT_MODEL,
    modelSupportsReasoning as providerSupportsReasoning,
    modelSupportsVision as providerSupportsVision,
    type ProviderModel,
} from "@shared/core/models";
import { fetchAvailableModels, fetchBootstrap } from "@/lib/agentchat-server";
import {
    getDefaultModel,
    setDefaultModel,
    getFavoriteModels,
    setFavoriteModels,
} from "@/lib/storage";

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
    const [models, setModels] = useState<ProviderModel[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [defaultAgentId, setDefaultAgentId] = useState<string | null>(null);
    const [selectedModel, setSelectedModel] = useState<string | null>(null);
    const [favoriteModels, setFavoriteModelsState] = useState<string[]>([]);
    const [hasLoadedSelectedModel, setHasLoadedSelectedModel] = useState(false);

    const loadSelectedModel = useCallback(async () => {
        try {
            const modelId = await getDefaultModel();
            if (modelId) {
                setSelectedModel(modelId);
            }
        } catch {
            console.error("Failed to load selected model");
        } finally {
            setHasLoadedSelectedModel(true);
        }
    }, []);

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
            const [bootstrap, fetchedModels] = await Promise.all([
                fetchBootstrap(),
                fetchAvailableModels(),
            ]);
            const primaryAgent =
                bootstrap.agents
                    .filter((agent) => agent.enabled)
                    .sort((a, b) => a.sortOrder - b.sortOrder)[0] ?? null;

            setDefaultAgentId(primaryAgent?.id ?? null);
            setModels(fetchedModels);

            const modelIds = fetchedModels.map((model) => model.id);
            let nextSelectedModel: string | null = null;

            if (selectedModel && modelIds.includes(selectedModel)) {
                nextSelectedModel = selectedModel;
            } else if (modelIds.includes(APP_DEFAULT_MODEL)) {
                nextSelectedModel = APP_DEFAULT_MODEL;
            } else if (fetchedModels.length > 0) {
                nextSelectedModel = fetchedModels[0].id;
            }

            if (nextSelectedModel && nextSelectedModel !== selectedModel) {
                await setDefaultModel(nextSelectedModel);
                setSelectedModel(nextSelectedModel);
            }
        } catch (err) {
            const message =
                err instanceof Error ? err.message : "Failed to fetch models";
            setError(message);
        } finally {
            setIsLoading(false);
        }
    }, [selectedModel]);

    const selectModel = useCallback(async (modelId: string) => {
        try {
            await setDefaultModel(modelId);
            setSelectedModel(modelId);
        } catch {
            console.error("Failed to save selected model");
        }
    }, []);

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

    return (
        <ModelContext.Provider
            value={{
                models,
                isLoading,
                error,
                defaultAgentId,
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
