import * as SecureStore from "expo-secure-store";

const CREDENTIAL_KEYS = {
    AUTH_TOKEN: "agentchat-auth-token",
    REFRESH_TOKEN: "agentchat-refresh-token",
} as const;

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
    await clearAuthToken();
    await clearRefreshToken();
}

export type { CREDENTIAL_KEYS };
