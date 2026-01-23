import * as SecureStore from "expo-secure-store";
import type { SyncState } from "@shared/core/sync";

const SYNC_STATE_KEY = "routerchat-sync-state";

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
