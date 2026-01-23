import * as SecureStore from "expo-secure-store";

const CONVEX_URL_KEY = "routerchat-convex-url";

export function isConvexConfigured(): boolean {
    const url = getConvexUrl();
    return url !== null && url.startsWith("https://");
}

export function getConvexUrl(): string | null {
    if (typeof window === "undefined") {
        return null;
    }
    const url = SecureStore.getItem(CONVEX_URL_KEY);
    if (!url || url.trim() === "") {
        return null;
    }
    return url;
}

export async function setConvexUrl(url: string): Promise<void> {
    if (!url || !url.startsWith("https://")) {
        throw new Error("Invalid Convex URL");
    }
    await SecureStore.setItem(CONVEX_URL_KEY, url);
}

export async function clearConvexUrl(): Promise<void> {
    await SecureStore.deleteItemAsync(CONVEX_URL_KEY);
}
