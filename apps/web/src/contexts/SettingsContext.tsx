"use client";

import React, {
    createContext,
    useContext,
    useEffect,
    useMemo,
    useState,
    useCallback,
    useRef,
} from "react";
import type { UserSettings, OpenRouterModel, ThinkingLevel } from "@/lib/types";
import * as storage from "@/lib/storage";
import { fetchAvailableModels } from "@/lib/agentchat-server";
import { useAgent } from "@/contexts/AgentContext";
import {
    filterModelsForAgent,
    selectScopedDefaultModel,
} from "@/contexts/settings-helpers";

interface SettingsContextType extends UserSettings {
    setDefaultModel: (modelId: string) => void;
    setDefaultThinking: (value: ThinkingLevel) => void;
    setTheme: (theme: UserSettings["theme"]) => void;
    toggleFavoriteModel: (modelId: string) => void;
    models: OpenRouterModel[];
    loadingModels: boolean;
    refreshModels: () => Promise<void>;
}

const defaultSettings: UserSettings = {
    defaultModel: "",
    defaultThinking: "none",
    theme: "system",
    favoriteModels: [],
};

const SettingsContext = createContext<SettingsContextType | null>(null);

export function selectInitialDefaultModel(params: {
    fetchedModels: OpenRouterModel[];
    userPreferredModel: string | null;
    agentDefaultModel: string | null;
}): string | null {
    return selectScopedDefaultModel({
        models: params.fetchedModels,
        userPreferredModel: params.userPreferredModel,
        agentDefaultModel: params.agentDefaultModel,
    });
}

export function SettingsProvider({ children }: { children: React.ReactNode }) {
    const { selectedAgent, selectedAgentOptions } = useAgent();
    const [settings, setSettings] = useState<UserSettings>(defaultSettings);
    const [allModels, setAllModels] = useState<OpenRouterModel[]>([]);
    const [loadingModels, setLoadingModels] = useState(false);
    const [mounted, setMounted] = useState(false);
    const refreshPromiseRef = useRef<Promise<void> | null>(null);

    const models = useMemo(
        () =>
            filterModelsForAgent({
                models: allModels,
                selectedAgent,
                selectedAgentOptions,
            }),
        [allModels, selectedAgent, selectedAgentOptions],
    );

    const refreshModels = useCallback(async () => {
        // Prevent duplicate requests
        if (refreshPromiseRef.current) {
            return refreshPromiseRef.current;
        }

        setLoadingModels(true);
        try {
            const promise = fetchAvailableModels().then((fetchedModels) => {
                setAllModels(fetchedModels);
            });
            refreshPromiseRef.current = promise;
            await promise;
        } catch (err) {
            console.error("Failed to load models:", err);
        } finally {
            setLoadingModels(false);
            refreshPromiseRef.current = null;
        }
    }, []);

    useEffect(() => {
        setSettings((prev) => ({
            ...prev,
            defaultModel: storage.getDefaultModel(),
            defaultThinking: storage.getDefaultThinking(),
            theme: storage.getTheme(),
            favoriteModels: storage.getFavoriteModels(),
        }));
        setMounted(true);
    }, []);

    useEffect(() => {
        if (mounted) {
            refreshModels();
        }
    }, [mounted, refreshModels]);

    useEffect(() => {
        if (!mounted) return;

        const selectedModelId = selectInitialDefaultModel({
            fetchedModels: models,
            userPreferredModel: storage.getDefaultModel(),
            agentDefaultModel:
                selectedAgentOptions?.defaultModel ??
                selectedAgent?.defaultModel ??
                null,
        });

        if (!selectedModelId) {
            return;
        }

        storage.setDefaultModel(selectedModelId);
        setSettings((prev) =>
            prev.defaultModel === selectedModelId
                ? prev
                : {
                      ...prev,
                      defaultModel: selectedModelId,
                  },
        );
    }, [
        models,
        mounted,
        selectedAgent?.defaultModel,
        selectedAgentOptions?.defaultModel,
    ]);

    const setDefaultModel = (modelId: string) => {
        storage.setDefaultModel(modelId);
        setSettings((prev) => ({ ...prev, defaultModel: modelId }));
    };

    const setDefaultThinking = (value: ThinkingLevel) => {
        storage.setDefaultThinking(value);
        setSettings((prev) => ({ ...prev, defaultThinking: value }));
    };

    const setTheme = (theme: UserSettings["theme"]) => {
        storage.setTheme(theme);
        setSettings((prev) => ({ ...prev, theme }));

        if (typeof window !== "undefined") {
            const root = window.document.documentElement;
            root.classList.remove("light", "dark");

            if (theme === "system") {
                const systemTheme = window.matchMedia(
                    "(prefers-color-scheme: dark)",
                ).matches
                    ? "dark"
                    : "light";
                root.classList.add(systemTheme);
            } else {
                root.classList.add(theme);
            }
        }
    };

    const toggleFavoriteModel = (modelId: string) => {
        setSettings((prev) => {
            const isFavorite = prev.favoriteModels.includes(modelId);
            const newFavorites = isFavorite
                ? prev.favoriteModels.filter((id) => id !== modelId)
                : [...prev.favoriteModels, modelId];
            storage.setFavoriteModels(newFavorites);
            return { ...prev, favoriteModels: newFavorites };
        });
    };

    useEffect(() => {
        if (mounted) {
            setTheme(settings.theme);
        }
    }, [mounted, settings.theme]);

    return (
        <SettingsContext.Provider
            value={{
                ...settings,
                setDefaultModel,
                setDefaultThinking,
                setTheme,
                toggleFavoriteModel,
                models,
                loadingModels,
                refreshModels,
            }}
        >
            {children}
        </SettingsContext.Provider>
    );
}

export function useSettings() {
    const context = useContext(SettingsContext);
    if (!context) {
        throw new Error("useSettings must be used within a SettingsProvider");
    }
    return context;
}
