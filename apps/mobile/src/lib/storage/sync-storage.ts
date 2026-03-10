import * as SecureStore from "expo-secure-store";
import type { SyncState } from "@shared/core/sync";
import type { SyncMetadata } from "@/lib/sync/types";
import { DEFAULT_SYNC_METADATA } from "@/lib/sync/types";

export type UserTheme = "light" | "dark" | "system";

const SYNC_STATE_KEY = "routerchat-sync-state";
const SYNC_METADATA_KEY = "routerchat-sync-metadata";
const THEME_KEY = "routerchat-theme";
const ONBOARDING_KEY = "routerchat-has-completed-onboarding";

export async function getSyncState(): Promise<SyncState | null> {
    try {
        const state = await SecureStore.getItemAsync(SYNC_STATE_KEY);
        if (!state) return null;

        const parsed = JSON.parse(state);
        if (
            parsed === "local-only" ||
            parsed === "cloud-enabled" ||
            parsed === "cloud-disabled"
        ) {
            return parsed;
        }
        return null;
    } catch {
        return null;
    }
}

export async function setSyncState(state: SyncState): Promise<void> {
    try {
        await SecureStore.setItemAsync(SYNC_STATE_KEY, JSON.stringify(state));
    } catch (error) {
        console.error("Failed to save sync state:", error);
    }
}

export async function clearSyncState(): Promise<void> {
    try {
        await SecureStore.deleteItemAsync(SYNC_STATE_KEY);
    } catch (error) {
        console.error("Failed to clear sync state:", error);
    }
}

export async function getSyncMetadata(): Promise<SyncMetadata> {
    try {
        const stored = await SecureStore.getItemAsync(SYNC_METADATA_KEY);
        if (stored) {
            const parsed = JSON.parse(stored) as Partial<SyncMetadata>;
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

export async function setSyncMetadata(metadata: SyncMetadata): Promise<void> {
    try {
        await SecureStore.setItemAsync(
            SYNC_METADATA_KEY,
            JSON.stringify(metadata),
        );
    } catch (error) {
        console.error("Failed to save sync metadata:", error);
    }
}

export async function updateSyncMetadata(
    updates: Partial<SyncMetadata>,
): Promise<SyncMetadata> {
    const current = await getSyncMetadata();
    const updated = { ...current, ...updates };
    await setSyncMetadata(updated);
    return updated;
}

export async function getTheme(): Promise<UserTheme> {
    try {
        const theme = await SecureStore.getItemAsync(THEME_KEY);
        if (theme === "light" || theme === "dark" || theme === "system") {
            return theme;
        }
        return "system";
    } catch {
        return "system";
    }
}

export async function setTheme(theme: UserTheme): Promise<void> {
    try {
        await SecureStore.setItemAsync(THEME_KEY, theme);
    } catch (error) {
        console.error("Failed to save theme:", error);
    }
}

export async function getHasCompletedOnboarding(): Promise<boolean> {
    try {
        const result = await SecureStore.getItemAsync(ONBOARDING_KEY);
        return result === "true";
    } catch {
        return false;
    }
}

export async function setHasCompletedOnboarding(): Promise<void> {
    try {
        await SecureStore.setItemAsync(ONBOARDING_KEY, "true");
    } catch (error) {
        console.error("Failed to save onboarding state:", error);
    }
}
