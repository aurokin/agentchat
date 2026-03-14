import * as SecureStore from "expo-secure-store";

export type UserTheme = "light" | "dark" | "system";

const THEME_KEY = "agentchat-theme";
const THEME_SELECTION_KEY = "agentchat-theme-selection-set";
const ONBOARDING_KEY = "agentchat-has-completed-onboarding";

export async function getTheme(): Promise<UserTheme> {
    try {
        const [theme, hasExplicitSelection] = await Promise.all([
            SecureStore.getItemAsync(THEME_KEY),
            SecureStore.getItemAsync(THEME_SELECTION_KEY),
        ]);
        if (hasExplicitSelection !== "true") {
            return "system";
        }
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
        await Promise.all([
            SecureStore.setItemAsync(THEME_KEY, theme),
            SecureStore.setItemAsync(THEME_SELECTION_KEY, "true"),
        ]);
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
