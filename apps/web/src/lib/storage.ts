import type { SyncState, SyncMetadata } from "./sync/types";
import { DEFAULT_SYNC_METADATA } from "./sync/types";

const STORAGE_KEYS = {
    THEME: "routerchat-theme",
    DEFAULT_MODEL: "routerchat-default-model",
    DEFAULT_THINKING: "routerchat-default-thinking",
    FAVORITE_MODELS: "routerchat-favorite-models",
    SELECTED_AGENT: "agentchat-selected-agent",
    SELECTED_CHAT_BY_AGENT: "agentchat-selected-chat-by-agent",
    // Cloud sync keys
    SYNC_STATE: "routerchat-sync-state",
    SYNC_METADATA: "routerchat-sync-metadata",
    SYNC_AUTO_ENABLE: "routerchat-sync-auto-enable",
} as const;

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

export function getSelectedAgentId(): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(STORAGE_KEYS.SELECTED_AGENT);
}

export function setSelectedAgentId(agentId: string): void {
    if (typeof window === "undefined") return;
    localStorage.setItem(STORAGE_KEYS.SELECTED_AGENT, agentId);
}

export function clearSelectedAgentId(): void {
    if (typeof window === "undefined") return;
    localStorage.removeItem(STORAGE_KEYS.SELECTED_AGENT);
}

function getSelectedChatMap(): Record<string, string> {
    if (typeof window === "undefined") return {};
    try {
        const raw = localStorage.getItem(STORAGE_KEYS.SELECTED_CHAT_BY_AGENT);
        if (!raw) {
            return {};
        }

        const parsed = JSON.parse(raw) as unknown;
        if (!parsed || typeof parsed !== "object") {
            return {};
        }

        return Object.fromEntries(
            Object.entries(parsed).filter(
                (entry): entry is [string, string] =>
                    typeof entry[0] === "string" &&
                    typeof entry[1] === "string" &&
                    entry[0].length > 0 &&
                    entry[1].length > 0,
            ),
        );
    } catch {
        return {};
    }
}

function setSelectedChatMap(value: Record<string, string>): void {
    if (typeof window === "undefined") return;
    localStorage.setItem(
        STORAGE_KEYS.SELECTED_CHAT_BY_AGENT,
        JSON.stringify(value),
    );
}

export function getSelectedChatId(agentId: string): string | null {
    if (!agentId) return null;
    return getSelectedChatMap()[agentId] ?? null;
}

export function setSelectedChatId(agentId: string, chatId: string): void {
    if (typeof window === "undefined" || !agentId || !chatId) return;
    const next = getSelectedChatMap();
    next[agentId] = chatId;
    setSelectedChatMap(next);
}

export function clearSelectedChatId(agentId: string): void {
    if (typeof window === "undefined" || !agentId) return;
    const next = getSelectedChatMap();
    delete next[agentId];
    setSelectedChatMap(next);
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
