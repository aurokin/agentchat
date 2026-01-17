import type { SearchLevel, Skill } from "./types";
import type { SyncState, SyncMetadata } from "./sync/types";
import { DEFAULT_SYNC_METADATA } from "./sync/types";

const STORAGE_KEYS = {
    API_KEY: "routerchat-api-key",
    THEME: "routerchat-theme",
    DEFAULT_MODEL: "routerchat-default-model",
    DEFAULT_THINKING: "routerchat-default-thinking",
    DEFAULT_SEARCH: "routerchat-default-search",
    FAVORITE_MODELS: "routerchat-favorite-models",
    SKILLS: "routerchat-skills",
    DEFAULT_SKILL: "routerchat-default-skill",
    SELECTED_SKILL: "routerchat-selected-skill",
    SELECTED_SKILL_ID: "routerchat-selected-skill-id",
    SELECTED_SKILL_MODE: "routerchat-selected-skill-mode",
    // Cloud sync keys
    SYNC_STATE: "routerchat-sync-state",
    SYNC_METADATA: "routerchat-sync-metadata",
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

export function getSelectedSkillId(): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(STORAGE_KEYS.SELECTED_SKILL_ID);
}

export function setSelectedSkillId(skillId: string | null): void {
    if (typeof window === "undefined") return;
    if (skillId) {
        localStorage.setItem(STORAGE_KEYS.SELECTED_SKILL_ID, skillId);
    } else {
        localStorage.removeItem(STORAGE_KEYS.SELECTED_SKILL_ID);
    }
}

export function getSelectedSkillMode(): "auto" | "manual" {
    if (typeof window === "undefined") return "auto";
    const stored = localStorage.getItem(STORAGE_KEYS.SELECTED_SKILL_MODE);
    return stored === "manual" ? "manual" : "auto";
}

export function setSelectedSkillMode(mode: "auto" | "manual"): void {
    if (typeof window === "undefined") return;
    localStorage.setItem(STORAGE_KEYS.SELECTED_SKILL_MODE, mode);
}

// Cloud Sync Storage Functions

export function getSyncState(): SyncState {
    if (typeof window === "undefined") return "local-only";
    const stored = localStorage.getItem(STORAGE_KEYS.SYNC_STATE);
    if (
        stored === "local-only" ||
        stored === "cloud-enabled" ||
        stored === "cloud-disabled"
    ) {
        return stored;
    }
    return "local-only";
}

export function setSyncState(state: SyncState): void {
    if (typeof window === "undefined") return;
    localStorage.setItem(STORAGE_KEYS.SYNC_STATE, state);
}

export function getSyncMetadata(): SyncMetadata {
    if (typeof window === "undefined") return DEFAULT_SYNC_METADATA;
    try {
        const stored = localStorage.getItem(STORAGE_KEYS.SYNC_METADATA);
        if (stored) {
            const parsed = JSON.parse(stored);
            // Validate and merge with defaults to ensure all fields exist
            return {
                ...DEFAULT_SYNC_METADATA,
                ...parsed,
            };
        }
        return DEFAULT_SYNC_METADATA;
    } catch {
        return DEFAULT_SYNC_METADATA;
    }
}

export function setSyncMetadata(metadata: SyncMetadata): void {
    if (typeof window === "undefined") return;
    localStorage.setItem(STORAGE_KEYS.SYNC_METADATA, JSON.stringify(metadata));
}

export function updateSyncMetadata(
    updates: Partial<SyncMetadata>,
): SyncMetadata {
    const current = getSyncMetadata();
    const updated = { ...current, ...updates };
    setSyncMetadata(updated);
    return updated;
}

export function clearSyncData(): void {
    if (typeof window === "undefined") return;
    localStorage.removeItem(STORAGE_KEYS.SYNC_STATE);
    localStorage.removeItem(STORAGE_KEYS.SYNC_METADATA);
}
