import React, {
    createContext,
    useContext,
    useState,
    useCallback,
    useEffect,
    type ReactNode,
} from "react";
import { type OpenRouterModel, SupportedParameter } from "@shared/core/models";
import { fetchModels } from "@shared/core/openrouter";
import * as SecureStore from "expo-secure-store";

interface ModelContextValue {
    models: OpenRouterModel[];
    isLoading: boolean;
    error: string | null;
    selectedModel: string | null;
    selectModel: (modelId: string) => Promise<void>;
    refreshModels: () => Promise<void>;
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

const SELECTED_MODEL_KEY = "routerchat-selected-model";

export function ModelProvider({
    children,
}: ModelProviderProps): React.ReactElement {
    const [models, setModels] = useState<OpenRouterModel[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedModel, setSelectedModel] = useState<string | null>(null);
    const [hasLoadedSelectedModel, setHasLoadedSelectedModel] = useState(false);

    const loadSelectedModel = useCallback(async () => {
        try {
            const modelId = await SecureStore.getItemAsync(SELECTED_MODEL_KEY);
            if (modelId) {
                setSelectedModel(modelId);
            }
        } catch {
            console.error("Failed to load selected model");
        } finally {
            setHasLoadedSelectedModel(true);
        }
    }, []);

    const refreshModels = useCallback(async () => {
        setIsLoading(true);
        setError(null);

        try {
            const fetchedModels = await fetchModels();
            setModels(fetchedModels);

            if (!selectedModel && fetchedModels.length > 0) {
                const defaultModel = fetchedModels.find(
                    (m) => m.id === "anthropic/claude-3-5-sonnet-20241022",
                );
                if (defaultModel) {
                    await SecureStore.setItemAsync(
                        SELECTED_MODEL_KEY,
                        defaultModel.id,
                    );
                    setSelectedModel(defaultModel.id);
                }
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
            await SecureStore.setItemAsync(SELECTED_MODEL_KEY, modelId);
            setSelectedModel(modelId);
        } catch {
            console.error("Failed to save selected model");
        }
    }, []);

    useEffect(() => {
        loadSelectedModel();
    }, [loadSelectedModel]);

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
                selectedModel,
                selectModel,
                refreshModels,
            }}
        >
            {children}
        </ModelContext.Provider>
    );
}

export function modelSupportsVision(
    modelId: string,
    models: OpenRouterModel[],
): boolean {
    const model = models.find((m) => m.id === modelId);
    return (
        model?.supportedParameters?.includes(SupportedParameter.Vision) ?? false
    );
}

export function modelSupportsSearch(
    modelId: string,
    models: OpenRouterModel[],
): boolean {
    const model = models.find((m) => m.id === modelId);
    return (
        model?.supportedParameters?.includes(SupportedParameter.Tools) ?? false
    );
}

export function modelSupportsReasoning(
    modelId: string,
    models: OpenRouterModel[],
): boolean {
    const model = models.find((m) => m.id === modelId);
    return (
        model?.supportedParameters?.includes(SupportedParameter.Reasoning) ??
        false
    );
}
