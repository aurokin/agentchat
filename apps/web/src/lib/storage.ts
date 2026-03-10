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
    CLOUD_DEFAULT_SKILL: "routerchat-cloud-default-skill",
    CLOUD_SELECTED_SKILL_ID: "routerchat-cloud-selected-skill-id",
    CLOUD_SELECTED_SKILL_MODE: "routerchat-cloud-selected-skill-mode",
    // Cloud sync keys
    SYNC_STATE: "routerchat-sync-state",
    SYNC_METADATA: "routerchat-sync-metadata",
    SYNC_AUTO_ENABLE: "routerchat-sync-auto-enable",
} as const;

type SkillSettingsKeys = {
    defaultSkillId: string;
    selectedSkillId: string;
    selectedSkillMode: string;
    legacySelectedSkill?: string;
};

const LOCAL_SKILL_SETTINGS_KEYS: SkillSettingsKeys = {
    defaultSkillId: STORAGE_KEYS.DEFAULT_SKILL,
    selectedSkillId: STORAGE_KEYS.SELECTED_SKILL_ID,
    selectedSkillMode: STORAGE_KEYS.SELECTED_SKILL_MODE,
    legacySelectedSkill: STORAGE_KEYS.SELECTED_SKILL,
};

const CLOUD_SKILL_SETTINGS_KEYS: SkillSettingsKeys = {
    defaultSkillId: STORAGE_KEYS.CLOUD_DEFAULT_SKILL,
    selectedSkillId: STORAGE_KEYS.CLOUD_SELECTED_SKILL_ID,
    selectedSkillMode: STORAGE_KEYS.CLOUD_SELECTED_SKILL_MODE,
};

function getDefaultSkillIdFromKeys(keys: SkillSettingsKeys): string | null {
    if (typeof window === "undefined") return null;
    const stored = localStorage.getItem(keys.defaultSkillId);
    if (stored) return stored;
    if (keys.legacySelectedSkill) {
        const legacy = localStorage.getItem(keys.legacySelectedSkill);
        if (legacy) {
            localStorage.setItem(keys.defaultSkillId, legacy);
            localStorage.removeItem(keys.legacySelectedSkill);
            return legacy;
        }
    }
    return null;
}

function setDefaultSkillIdFromKeys(
    keys: SkillSettingsKeys,
    skillId: string | null,
): void {
    if (typeof window === "undefined") return;
    if (skillId) {
        localStorage.setItem(keys.defaultSkillId, skillId);
    } else {
        localStorage.removeItem(keys.defaultSkillId);
    }
}

function getSelectedSkillIdFromKeys(keys: SkillSettingsKeys): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(keys.selectedSkillId);
}

function setSelectedSkillIdFromKeys(
    keys: SkillSettingsKeys,
    skillId: string | null,
): void {
    if (typeof window === "undefined") return;
    if (skillId) {
        localStorage.setItem(keys.selectedSkillId, skillId);
    } else {
        localStorage.removeItem(keys.selectedSkillId);
    }
}

function getSelectedSkillModeFromKeys(
    keys: SkillSettingsKeys,
): "auto" | "manual" {
    if (typeof window === "undefined") return "auto";
    const stored = localStorage.getItem(keys.selectedSkillMode);
    return stored === "manual" ? "manual" : "auto";
}

function setSelectedSkillModeFromKeys(
    keys: SkillSettingsKeys,
    mode: "auto" | "manual",
): void {
    if (typeof window === "undefined") return;
    localStorage.setItem(keys.selectedSkillMode, mode);
}

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
    return getDefaultSkillIdFromKeys(LOCAL_SKILL_SETTINGS_KEYS);
}

export function setDefaultSkillId(skillId: string | null): void {
    setDefaultSkillIdFromKeys(LOCAL_SKILL_SETTINGS_KEYS, skillId);
}

export function getSelectedSkillId(): string | null {
    return getSelectedSkillIdFromKeys(LOCAL_SKILL_SETTINGS_KEYS);
}

export function setSelectedSkillId(skillId: string | null): void {
    setSelectedSkillIdFromKeys(LOCAL_SKILL_SETTINGS_KEYS, skillId);
}

export function getSelectedSkillMode(): "auto" | "manual" {
    return getSelectedSkillModeFromKeys(LOCAL_SKILL_SETTINGS_KEYS);
}

export function setSelectedSkillMode(mode: "auto" | "manual"): void {
    setSelectedSkillModeFromKeys(LOCAL_SKILL_SETTINGS_KEYS, mode);
}

export function getCloudDefaultSkillId(): string | null {
    return getDefaultSkillIdFromKeys(CLOUD_SKILL_SETTINGS_KEYS);
}

export function setCloudDefaultSkillId(skillId: string | null): void {
    setDefaultSkillIdFromKeys(CLOUD_SKILL_SETTINGS_KEYS, skillId);
}

export function getCloudSelectedSkillId(): string | null {
    return getSelectedSkillIdFromKeys(CLOUD_SKILL_SETTINGS_KEYS);
}

export function setCloudSelectedSkillId(skillId: string | null): void {
    setSelectedSkillIdFromKeys(CLOUD_SKILL_SETTINGS_KEYS, skillId);
}

export function getCloudSelectedSkillMode(): "auto" | "manual" {
    return getSelectedSkillModeFromKeys(CLOUD_SKILL_SETTINGS_KEYS);
}

export function setCloudSelectedSkillMode(mode: "auto" | "manual"): void {
    setSelectedSkillModeFromKeys(CLOUD_SKILL_SETTINGS_KEYS, mode);
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

export type SyncAutoEnableReason = "login";

export function getSyncAutoEnableReason(): SyncAutoEnableReason | null {
    if (typeof window === "undefined") return null;
    const stored = localStorage.getItem(STORAGE_KEYS.SYNC_AUTO_ENABLE);
    if (stored === "login") {
        return stored;
    }
    return null;
}

export function setSyncAutoEnableReason(reason: SyncAutoEnableReason): void {
    if (typeof window === "undefined") return;
    localStorage.setItem(STORAGE_KEYS.SYNC_AUTO_ENABLE, reason);
}

export function clearSyncAutoEnableReason(): void {
    if (typeof window === "undefined") return;
    localStorage.removeItem(STORAGE_KEYS.SYNC_AUTO_ENABLE);
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
    localStorage.removeItem(STORAGE_KEYS.SYNC_AUTO_ENABLE);
}
