"use client";

import React, {
    createContext,
    useContext,
    useEffect,
    useState,
    useCallback,
    useRef,
} from "react";
import { useStorageAdapter } from "@/contexts/SyncContext";
import type {
    UserSettings,
    OpenRouterModel,
    ThinkingLevel,
    SearchLevel,
    Skill,
} from "@/lib/types";
import { APP_DEFAULT_MODEL } from "@shared/core/models";
import { v4 as uuid } from "uuid";
import * as storage from "@/lib/storage";
import { fetchModels } from "@/lib/openrouter";
import { useApiKey } from "@/hooks/useApiKey";

interface SettingsContextType extends UserSettings {
    setApiKey: (key: string) => void;
    clearApiKey: () => void;
    setDefaultModel: (modelId: string) => void;
    setDefaultThinking: (value: ThinkingLevel) => void;
    setDefaultSearchLevel: (level: SearchLevel) => void;
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
    defaultSkill: Skill | null;
    setSelectedSkill: (
        skill: Skill | null,
        options?: { mode?: "auto" | "manual" },
    ) => void;
    selectedSkillMode: "auto" | "manual";
    setDefaultSkill: (skill: Skill | null) => void;
}

const defaultSettings: UserSettings = {
    apiKey: null,
    defaultModel: "",
    defaultThinking: "none",
    defaultSearchLevel: "none",
    theme: "system",
    favoriteModels: [],
};

const SettingsContext = createContext<SettingsContextType | null>(null);

export function selectInitialDefaultModel(params: {
    fetchedModels: OpenRouterModel[];
    userPreferredModel: string | null;
}): string | null {
    const { fetchedModels, userPreferredModel } = params;
    const modelIds = fetchedModels.map((model) => model.id);

    if (userPreferredModel && modelIds.includes(userPreferredModel)) {
        return userPreferredModel;
    }

    if (modelIds.includes(APP_DEFAULT_MODEL)) {
        return APP_DEFAULT_MODEL;
    }

    return fetchedModels[0]?.id ?? null;
}

export function SettingsProvider({ children }: { children: React.ReactNode }) {
    const [settings, setSettings] = useState<UserSettings>(defaultSettings);
    const [models, setModels] = useState<OpenRouterModel[]>([]);
    const [loadingModels, setLoadingModels] = useState(false);
    const [mounted, setMounted] = useState(false);
    const [skills, setSkills] = useState<Skill[]>([]);
    const [selectedSkill, setSelectedSkillState] = useState<Skill | null>(null);
    const [selectedSkillMode, setSelectedSkillMode] = useState<
        "auto" | "manual"
    >("auto");
    const [defaultSkillId, setDefaultSkillIdState] = useState<string | null>(
        null,
    );
    const refreshPromiseRef = useRef<Promise<void> | null>(null);
    const storageAdapter = useStorageAdapter();

    // Use the useApiKey hook for cloud-synced API key management
    const {
        apiKey: cloudApiKey,
        setApiKey: setCloudApiKey,
        clearApiKey: clearCloudApiKey,
    } = useApiKey();

    const refreshModels = useCallback(async () => {
        // Prevent duplicate requests
        if (refreshPromiseRef.current) {
            return refreshPromiseRef.current;
        }

        setLoadingModels(true);
        try {
            const promise = fetchModels().then((fetchedModels) => {
                setModels(fetchedModels);

                const selectedModelId = selectInitialDefaultModel({
                    fetchedModels,
                    userPreferredModel: storage.getDefaultModel(),
                });

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

    // Initialize non-API-key settings from localStorage
    useEffect(() => {
        setSettings((prev) => ({
            ...prev,
            defaultModel: storage.getDefaultModel(),
            defaultThinking: storage.getDefaultThinking(),
            defaultSearchLevel: storage.getDefaultSearchLevel(),
            theme: storage.getTheme(),
            favoriteModels: storage.getFavoriteModels(),
        }));
        setMounted(true);
    }, []);

    // Sync API key from the useApiKey hook (handles cloud sync automatically)
    useEffect(() => {
        setSettings((prev) => ({
            ...prev,
            apiKey: cloudApiKey,
        }));
    }, [cloudApiKey]);

    useEffect(() => {
        let isActive = true;

        const loadSkills = async () => {
            try {
                const [loadedSkills, skillSettings] = await Promise.all([
                    storageAdapter.getSkills(),
                    storageAdapter.getSkillSettings(),
                ]);

                if (!isActive) return;

                setSkills(loadedSkills);
                setDefaultSkillIdState(skillSettings.defaultSkillId);
                setSelectedSkillMode(skillSettings.selectedSkillMode);

                const selectedSkill = skillSettings.selectedSkillId
                    ? (loadedSkills.find(
                          (skill) => skill.id === skillSettings.selectedSkillId,
                      ) ?? null)
                    : null;

                setSelectedSkillState(selectedSkill);
            } catch (error) {
                console.error("Failed to load skills:", error);
            }
        };

        void loadSkills();

        return () => {
            isActive = false;
        };
    }, [storageAdapter]);

    useEffect(() => {
        if (mounted) {
            refreshModels();
        }
    }, [mounted, refreshModels]);

    const setApiKey = useCallback(
        (key: string) => {
            // Use the cloud-synced API key setter
            // This will save to both local storage and cloud (if enabled)
            void setCloudApiKey(key);
            // Local state will be updated via the useEffect that watches cloudApiKey
        },
        [setCloudApiKey],
    );

    const clearApiKey = useCallback(() => {
        // Use the cloud-synced API key clearer
        // This will clear from both local storage and cloud (if enabled)
        void clearCloudApiKey();
        // Local state will be updated via the useEffect that watches cloudApiKey
    }, [clearCloudApiKey]);

    const setDefaultModel = (modelId: string) => {
        storage.setDefaultModel(modelId);
        setSettings((prev) => ({ ...prev, defaultModel: modelId }));
    };

    const setDefaultThinking = (value: ThinkingLevel) => {
        storage.setDefaultThinking(value);
        setSettings((prev) => ({ ...prev, defaultThinking: value }));
    };

    const setDefaultSearchLevel = (level: SearchLevel) => {
        storage.setDefaultSearchLevel(level);
        setSettings((prev) => ({ ...prev, defaultSearchLevel: level }));
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
        void storageAdapter.createSkill(newSkill);
        return newSkill;
    };

    const updateSkill = (id: string, updates: Partial<Skill>) => {
        const newSkills = skills.map((s) =>
            s.id === id ? { ...s, ...updates } : s,
        );
        const updatedSkill = newSkills.find((skill) => skill.id === id);
        setSkills(newSkills);
        if (selectedSkill?.id === id && updatedSkill) {
            setSelectedSkillState(updatedSkill);
        }

        if (updatedSkill) {
            void storageAdapter.updateSkill(updatedSkill);
        }
    };

    const setDefaultSkill = useCallback(
        (skill: Skill | null) => {
            const skillId = skill?.id ?? null;
            setDefaultSkillIdState(skillId);
            void storageAdapter.upsertSkillSettings({
                defaultSkillId: skillId,
            });
        },
        [storageAdapter],
    );

    const deleteSkill = (id: string) => {
        const newSkills = skills.filter((s) => s.id !== id);
        setSkills(newSkills);
        void storageAdapter.deleteSkill(id);

        if (selectedSkill?.id === id) {
            setSelectedSkillState(null);
            setSelectedSkillMode("auto");
            void storageAdapter.upsertSkillSettings({
                selectedSkillId: null,
                selectedSkillMode: "auto",
            });
        }
        if (defaultSkillId === id) {
            setDefaultSkill(null);
        }
    };

    const setSelectedSkill = (
        skill: Skill | null,
        options?: { mode?: "auto" | "manual" },
    ) => {
        const mode = options?.mode ?? "manual";
        setSelectedSkillState(skill);
        setSelectedSkillMode(mode);
        if (mode === "manual") {
            setDefaultSkill(skill ?? null);
        }
        void storageAdapter.upsertSkillSettings({
            selectedSkillId: skill?.id ?? null,
            selectedSkillMode: mode,
        });
    };

    useEffect(() => {
        if (
            defaultSkillId &&
            !skills.find((skill) => skill.id === defaultSkillId)
        ) {
            setDefaultSkill(null);
        }
        if (
            selectedSkill &&
            !skills.find((skill) => skill.id === selectedSkill.id)
        ) {
            setSelectedSkillState(null);
            setSelectedSkillMode("auto");
            void storageAdapter.upsertSkillSettings({
                selectedSkillId: null,
                selectedSkillMode: "auto",
            });
        }
    }, [
        defaultSkillId,
        selectedSkill,
        skills,
        setDefaultSkill,
        storageAdapter,
    ]);

    const defaultSkill = defaultSkillId
        ? skills.find((skill) => skill.id === defaultSkillId) || null
        : null;

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
                setDefaultSearchLevel,
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
                selectedSkillMode,
                defaultSkill,
                setSelectedSkill,
                setDefaultSkill,
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
