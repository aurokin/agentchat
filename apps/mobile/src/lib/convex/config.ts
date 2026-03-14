import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const CONVEX_URL_KEY = "agentchat-convex-url";

function normalizeConvexUrl(url?: string | null): string | null {
    if (!url) {
        return null;
    }
    const trimmed = url.trim();
    if (trimmed === "" || !trimmed.startsWith("https://")) {
        return null;
    }
    return trimmed;
}

export function getEnvConvexUrl(): string | null {
    return normalizeConvexUrl(process.env.EXPO_PUBLIC_CONVEX_URL);
}

export function getConvexUrlOverride(): string | null {
    if (!__DEV__ || typeof window === "undefined" || Platform.OS !== "web") {
        return null;
    }
    const override = SecureStore.getItem(CONVEX_URL_KEY);
    return normalizeConvexUrl(override);
}

export function getConvexUrl(): string | null {
    if (typeof window === "undefined") {
        return null;
    }
    return getConvexUrlOverride() ?? getEnvConvexUrl();
}

export function isConvexConfigured(): boolean {
    return getConvexUrl() !== null;
}

export async function setConvexUrl(url: string): Promise<void> {
    if (!__DEV__) {
        throw new Error(
            "Convex URL overrides are only supported in development builds.",
        );
    }
    const normalized = normalizeConvexUrl(url);
    if (!normalized) {
        throw new Error("Invalid Convex URL");
    }
    await SecureStore.setItem(CONVEX_URL_KEY, normalized);
}

export async function clearConvexUrl(): Promise<void> {
    if (!__DEV__) {
        return;
    }
    await SecureStore.deleteItemAsync(CONVEX_URL_KEY);
}
