"use client";

import React, {
    createContext,
    useContext,
    useEffect,
    useState,
    useCallback,
    useRef,
} from "react";
import type {
    UserSettings,
    OpenRouterModel,
    ThinkingLevel,
    Skill,
} from "@/lib/types";
import { v4 as uuid } from "uuid";
import * as storage from "@/lib/storage";
import { fetchModels } from "@/lib/openrouter";

interface SettingsContextType extends UserSettings {
    setApiKey: (key: string) => void;
    clearApiKey: () => void;
    setDefaultModel: (modelId: string) => void;
    setDefaultThinking: (value: ThinkingLevel) => void;
    setDefaultSearchEnabled: (enabled: boolean) => void;
    setTheme: (theme: UserSettings["theme"]) => void;
    toggleFavoriteModel: (modelId: string) => void;
    models: OpenRouterModel[];
    loadingModels: boolean;
    refreshModels: () => Promise<void>;
    skills: Skill[];
    addSkill: (skill: Omit<Skill, "id" | "createdAt">) => void;
    updateSkill: (id: string, updates: Partial<Skill>) => void;
    deleteSkill: (id: string) => void;
    selectedSkill: Skill | null;
    setSelectedSkill: (skill: Skill | null) => void;
}

const defaultSettings: UserSettings = {
    apiKey: null,
    defaultModel: "",
    defaultThinking: "none",
    defaultSearchEnabled: false,
    theme: "system",
    favoriteModels: [],
};

const SettingsContext = createContext<SettingsContextType | null>(null);

const APP_DEFAULT_MODEL = "minimax/minimax-m2.1";

export function SettingsProvider({ children }: { children: React.ReactNode }) {
    const [settings, setSettings] = useState<UserSettings>(defaultSettings);
    const [models, setModels] = useState<OpenRouterModel[]>([]);
    const [loadingModels, setLoadingModels] = useState(false);
    const [mounted, setMounted] = useState(false);
    const [skills, setSkills] = useState<Skill[]>([]);
    const [selectedSkill, setSelectedSkillState] = useState<Skill | null>(null);
    const refreshPromiseRef = useRef<Promise<void> | null>(null);

    const refreshModels = useCallback(async () => {
        const apiKey = storage.getApiKey();
        if (!apiKey) return;

        // Prevent duplicate requests
        if (refreshPromiseRef.current) {
            return refreshPromiseRef.current;
        }

        setLoadingModels(true);
        try {
            const promise = fetchModels(apiKey).then((fetchedModels) => {
                setModels(fetchedModels);

                // Select appropriate default model
                const userPreferredModel = storage.getDefaultModel();
                const modelIds = fetchedModels.map((m) => m.id);

                let selectedModelId: string | null = null;

                // 1. Try user's preferred model
                if (
                    userPreferredModel &&
                    modelIds.includes(userPreferredModel)
                ) {
                    selectedModelId = userPreferredModel;
                }
                // 2. Try app default model
                else if (modelIds.includes(APP_DEFAULT_MODEL)) {
                    selectedModelId = APP_DEFAULT_MODEL;
                }
                // 3. Fall back to first model from API
                else if (fetchedModels.length > 0) {
                    selectedModelId = fetchedModels[0].id;
                }

                // Update default model if we found one
                if (selectedModelId) {
                    storage.setDefaultModel(selectedModelId);
                    setSettings((prev) => ({
                        ...prev,
                        defaultModel: selectedModelId,
                    }));
                }
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
        setSettings({
            apiKey: storage.getApiKey(),
            defaultModel: storage.getDefaultModel(),
            defaultThinking: storage.getDefaultThinking(),
            defaultSearchEnabled: storage.getDefaultSearchEnabled(),
            theme: storage.getTheme(),
            favoriteModels: storage.getFavoriteModels(),
        });
        setSkills(storage.getSkills());
        const selectedId = storage.getSelectedSkillId();
        if (selectedId) {
            const allSkills = storage.getSkills();
            setSelectedSkillState(
                allSkills.find((s) => s.id === selectedId) || null,
            );
        }
        setMounted(true);
    }, []);

    useEffect(() => {
        if (mounted && storage.getApiKey()) {
            refreshModels();
        }
    }, [mounted, refreshModels]);

    const setApiKey = (key: string) => {
        storage.setApiKey(key);
        setSettings((prev) => ({ ...prev, apiKey: key }));
        if (key) {
            refreshModels();
        } else {
            setModels([]);
        }
    };

    const clearApiKey = () => {
        storage.clearApiKey();
        setSettings((prev) => ({ ...prev, apiKey: null }));
        setModels([]);
    };

    const setDefaultModel = (modelId: string) => {
        storage.setDefaultModel(modelId);
        setSettings((prev) => ({ ...prev, defaultModel: modelId }));
    };

    const setDefaultThinking = (value: ThinkingLevel) => {
        storage.setDefaultThinking(value);
        setSettings((prev) => ({ ...prev, defaultThinking: value }));
    };

    const setDefaultSearchEnabled = (enabled: boolean) => {
        storage.setDefaultSearchEnabled(enabled);
        setSettings((prev) => ({ ...prev, defaultSearchEnabled: enabled }));
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

    const addSkill = (skill: Omit<Skill, "id" | "createdAt">) => {
        const newSkill: Skill = {
            ...skill,
            id: uuid(),
            createdAt: Date.now(),
        };
        const newSkills = [...skills, newSkill];
        setSkills(newSkills);
        storage.setSkills(newSkills);
        return newSkill;
    };

    const updateSkill = (id: string, updates: Partial<Skill>) => {
        const newSkills = skills.map((s) =>
            s.id === id ? { ...s, ...updates } : s,
        );
        setSkills(newSkills);
        storage.setSkills(newSkills);
        if (selectedSkill?.id === id) {
            setSelectedSkillState({ ...selectedSkill, ...updates });
        }
    };

    const deleteSkill = (id: string) => {
        const newSkills = skills.filter((s) => s.id !== id);
        setSkills(newSkills);
        storage.setSkills(newSkills);
        if (selectedSkill?.id === id) {
            setSelectedSkillState(null);
            storage.setSelectedSkillId(null);
        }
    };

    const setSelectedSkill = (skill: Skill | null) => {
        setSelectedSkillState(skill);
        storage.setSelectedSkillId(skill?.id || null);
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
                setApiKey,
                clearApiKey,
                setDefaultModel,
                setDefaultThinking,
                setDefaultSearchEnabled,
                setTheme,
                toggleFavoriteModel,
                models,
                loadingModels,
                refreshModels,
                skills,
                addSkill,
                updateSkill,
                deleteSkill,
                selectedSkill,
                setSelectedSkill,
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
