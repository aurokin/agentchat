import * as SecureStore from "expo-secure-store";

const CREDENTIAL_KEYS = {
    API_KEY: "routerchat-api-key",
    AUTH_TOKEN: "routerchat-auth-token",
    REFRESH_TOKEN: "routerchat-refresh-token",
} as const;

export async function getApiKey(): Promise<string | null> {
    try {
        const value = await SecureStore.getItemAsync(CREDENTIAL_KEYS.API_KEY);
        return value;
    } catch {
        return null;
    }
}

export async function setApiKey(key: string): Promise<void> {
    try {
        await SecureStore.setItemAsync(CREDENTIAL_KEYS.API_KEY, key);
    } catch (error) {
        console.error("Failed to save API key to secure storage:", error);
        throw error;
    }
}

export async function clearApiKey(): Promise<void> {
    try {
        await SecureStore.deleteItemAsync(CREDENTIAL_KEYS.API_KEY);
    } catch (error) {
        console.error("Failed to clear API key from secure storage:", error);
        throw error;
    }
}

export async function getAuthToken(): Promise<string | null> {
    try {
        const value = await SecureStore.getItemAsync(
            CREDENTIAL_KEYS.AUTH_TOKEN,
        );
        return value;
    } catch {
        return null;
    }
}

export async function setAuthToken(token: string): Promise<void> {
    try {
        await SecureStore.setItemAsync(CREDENTIAL_KEYS.AUTH_TOKEN, token);
    } catch (error) {
        console.error("Failed to save auth token to secure storage:", error);
        throw error;
    }
}

export async function clearAuthToken(): Promise<void> {
    try {
        await SecureStore.deleteItemAsync(CREDENTIAL_KEYS.AUTH_TOKEN);
    } catch (error) {
        console.error("Failed to clear auth token from secure storage:", error);
        throw error;
    }
}

export async function getRefreshToken(): Promise<string | null> {
    try {
        const value = await SecureStore.getItemAsync(
            CREDENTIAL_KEYS.REFRESH_TOKEN,
        );
        return value;
    } catch {
        return null;
    }
}

export async function setRefreshToken(token: string): Promise<void> {
    try {
        await SecureStore.setItemAsync(CREDENTIAL_KEYS.REFRESH_TOKEN, token);
    } catch (error) {
        console.error("Failed to save refresh token to secure storage:", error);
        throw error;
    }
}

export async function clearRefreshToken(): Promise<void> {
    try {
        await SecureStore.deleteItemAsync(CREDENTIAL_KEYS.REFRESH_TOKEN);
    } catch (error) {
        console.error(
            "Failed to clear refresh token from secure storage:",
            error,
        );
        throw error;
    }
}

export async function clearAllCredentials(): Promise<void> {
    await clearApiKey();
    await clearAuthToken();
    await clearRefreshToken();
}

export type { CREDENTIAL_KEYS };
