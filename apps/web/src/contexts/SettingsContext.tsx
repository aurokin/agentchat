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
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { UserSettings, ProviderModel } from "@/lib/types";
import * as storage from "@/lib/storage";
import { fetchAvailableModels } from "@/lib/agentchat-server";
import {
    type AgentchatServerIssue,
    toAgentchatServerIssue,
} from "@/lib/server-issues";
import { useAgent } from "@/contexts/AgentContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { filterModelsForAgent } from "@/contexts/settings-helpers";

interface SettingsContextType extends UserSettings {
    setTheme: (theme: UserSettings["theme"]) => void;
    toggleFavoriteModel: (modelId: string) => void;
    models: ProviderModel[];
    loadingModels: boolean;
    modelsIssue: AgentchatServerIssue | null;
    refreshModels: () => Promise<void>;
}

const defaultSettings: UserSettings = {
    theme: "system",
    favoriteModels: [],
};

const SettingsContext = createContext<SettingsContextType | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
    const { selectedAgent, selectedAgentOptions } = useAgent();
    const { isWorkspaceReady } = useWorkspace();
    const [settings, setSettings] = useState<UserSettings>(defaultSettings);
    const [allModels, setAllModels] = useState<ProviderModel[]>([]);
    const [loadingModels, setLoadingModels] = useState(false);
    const [modelsIssue, setModelsIssue] = useState<AgentchatServerIssue | null>(
        null,
    );
    const [mounted, setMounted] = useState(false);
    const refreshPromiseRef = useRef<Promise<void> | null>(null);
    const preferences = useQuery(
        api.users.getPreferences,
        isWorkspaceReady ? {} : "skip",
    );
    const saveFavoriteModels = useMutation(api.users.setFavoriteModels);

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
        if (refreshPromiseRef.current) {
            return refreshPromiseRef.current;
        }

        setLoadingModels(true);
        try {
            const promise = fetchAvailableModels().then((fetchedModels) => {
                setModelsIssue(null);
                setAllModels(fetchedModels);
            });
            refreshPromiseRef.current = promise;
            await promise;
        } catch (err) {
            console.error("Failed to load models:", err);
            setModelsIssue(
                toAgentchatServerIssue({
                    scope: "models",
                    error: err,
                }),
            );
        } finally {
            setLoadingModels(false);
            refreshPromiseRef.current = null;
        }
    }, []);

    useEffect(() => {
        setSettings((prev) => ({
            ...prev,
            theme: storage.getTheme(),
        }));
        setMounted(true);
    }, []);

    useEffect(() => {
        if (mounted) {
            void refreshModels();
        }
    }, [mounted, refreshModels]);

    useEffect(() => {
        if (preferences === undefined) {
            return;
        }

        setSettings((prev) => ({
            ...prev,
            favoriteModels: preferences.favoriteModelIds,
        }));
    }, [preferences]);

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
            const favoriteModels = isFavorite
                ? prev.favoriteModels.filter((id) => id !== modelId)
                : [...prev.favoriteModels, modelId];
            void saveFavoriteModels({ modelIds: favoriteModels }).catch(
                (error) => {
                    console.error("Failed to save favorite models:", error);
                },
            );
            return { ...prev, favoriteModels };
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
                setTheme,
                toggleFavoriteModel,
                models,
                loadingModels,
                modelsIssue,
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
