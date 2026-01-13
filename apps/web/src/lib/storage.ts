import type { SearchLevel, Skill } from "./types";

const STORAGE_KEYS = {
    API_KEY: "router-chat-api-key",
    THEME: "router-chat-theme",
    DEFAULT_MODEL: "router-chat-default-model",
    DEFAULT_THINKING: "router-chat-default-thinking",
    DEFAULT_SEARCH: "router-chat-default-search",
    FAVORITE_MODELS: "router-chat-favorite-models",
    SKILLS: "router-chat-skills",
    DEFAULT_SKILL: "router-chat-default-skill",
    SELECTED_SKILL: "router-chat-selected-skill",
} as const;

export function getApiKey(): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(STORAGE_KEYS.API_KEY);
}

export function setApiKey(key: string): void {
    if (typeof window === "undefined") return;
    localStorage.setItem(STORAGE_KEYS.API_KEY, key);
}

export function clearApiKey(): void {
    if (typeof window === "undefined") return;
    localStorage.removeItem(STORAGE_KEYS.API_KEY);
}

export function getTheme(): "light" | "dark" | "system" {
    if (typeof window === "undefined") return "system";
    return (
        (localStorage.getItem(STORAGE_KEYS.THEME) as
            | "light"
            | "dark"
            | "system") || "system"
    );
}

export function setTheme(theme: "light" | "dark" | "system"): void {
    if (typeof window === "undefined") return;
    localStorage.setItem(STORAGE_KEYS.THEME, theme);
}

export function getDefaultModel(): string {
    if (typeof window === "undefined") return "";
    return localStorage.getItem(STORAGE_KEYS.DEFAULT_MODEL) || "";
}

export function setDefaultModel(modelId: string): void {
    if (typeof window === "undefined") return;
    localStorage.setItem(STORAGE_KEYS.DEFAULT_MODEL, modelId);
}

export function getFavoriteModels(): string[] {
    if (typeof window === "undefined") return [];
    try {
        const stored = localStorage.getItem(STORAGE_KEYS.FAVORITE_MODELS);
        return stored ? JSON.parse(stored) : [];
    } catch {
        return [];
    }
}

export function setFavoriteModels(modelIds: string[]): void {
    if (typeof window === "undefined") return;
    localStorage.setItem(
        STORAGE_KEYS.FAVORITE_MODELS,
        JSON.stringify(modelIds),
    );
}

export function getDefaultThinking():
    | "xhigh"
    | "high"
    | "medium"
    | "low"
    | "minimal"
    | "none" {
    if (typeof window === "undefined") return "none";
    return (
        (localStorage.getItem(STORAGE_KEYS.DEFAULT_THINKING) as
            | "xhigh"
            | "high"
            | "medium"
            | "low"
            | "minimal"
            | "none") || "none"
    );
}

export function setDefaultThinking(
    value: "xhigh" | "high" | "medium" | "low" | "minimal" | "none",
): void {
    if (typeof window === "undefined") return;
    localStorage.setItem(STORAGE_KEYS.DEFAULT_THINKING, value);
}

export function getDefaultSearchLevel(): SearchLevel {
    if (typeof window === "undefined") return "none";
    const stored = localStorage.getItem(STORAGE_KEYS.DEFAULT_SEARCH);
    // Handle migration from old boolean format
    if (stored === "true") return "medium";
    if (stored === "false" || stored === null) return "none";
    // New format - validate it's a valid SearchLevel
    if (["none", "low", "medium", "high"].includes(stored)) {
        return stored as SearchLevel;
    }
    return "none";
}

export function setDefaultSearchLevel(level: SearchLevel): void {
    if (typeof window === "undefined") return;
    localStorage.setItem(STORAGE_KEYS.DEFAULT_SEARCH, level);
}

export function getSkills(): Skill[] {
    if (typeof window === "undefined") return [];
    try {
        const stored = localStorage.getItem(STORAGE_KEYS.SKILLS);
        return stored ? JSON.parse(stored) : [];
    } catch {
        return [];
    }
}

export function setSkills(skills: Skill[]): void {
    if (typeof window === "undefined") return;
    localStorage.setItem(STORAGE_KEYS.SKILLS, JSON.stringify(skills));
}

export function getDefaultSkillId(): string | null {
    if (typeof window === "undefined") return null;
    const stored = localStorage.getItem(STORAGE_KEYS.DEFAULT_SKILL);
    if (stored) return stored;
    const legacy = localStorage.getItem(STORAGE_KEYS.SELECTED_SKILL);
    if (legacy) {
        localStorage.setItem(STORAGE_KEYS.DEFAULT_SKILL, legacy);
        localStorage.removeItem(STORAGE_KEYS.SELECTED_SKILL);
        return legacy;
    }
    return null;
}

export function setDefaultSkillId(skillId: string | null): void {
    if (typeof window === "undefined") return;
    if (skillId) {
        localStorage.setItem(STORAGE_KEYS.DEFAULT_SKILL, skillId);
    } else {
        localStorage.removeItem(STORAGE_KEYS.DEFAULT_SKILL);
    }
}
