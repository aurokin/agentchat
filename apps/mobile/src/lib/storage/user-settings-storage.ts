import * as SecureStore from "expo-secure-store";
import type { ThinkingLevel } from "@shared/core/types";

const DEFAULT_THINKING_KEY = "agentchat-default-thinking";
const DEFAULT_MODEL_KEY = "agentchat-selected-model";
const FAVORITE_MODELS_KEY = "agentchat-favorite-models";

const THINKING_LEVELS: ThinkingLevel[] = [
    "xhigh",
    "high",
    "medium",
    "low",
    "minimal",
    "none",
];

export async function getDefaultThinking(): Promise<ThinkingLevel> {
    try {
        const stored = await SecureStore.getItemAsync(DEFAULT_THINKING_KEY);
        if (stored && THINKING_LEVELS.includes(stored as ThinkingLevel)) {
            return stored as ThinkingLevel;
        }
        return "none";
    } catch {
        return "none";
    }
}

export async function setDefaultThinking(value: ThinkingLevel): Promise<void> {
    try {
        await SecureStore.setItemAsync(DEFAULT_THINKING_KEY, value);
    } catch (error) {
        console.error("Failed to save default thinking:", error);
    }
}

export async function getDefaultModel(): Promise<string | null> {
    try {
        return await SecureStore.getItemAsync(DEFAULT_MODEL_KEY);
    } catch {
        return null;
    }
}

export async function setDefaultModel(value: string): Promise<void> {
    try {
        await SecureStore.setItemAsync(DEFAULT_MODEL_KEY, value);
    } catch (error) {
        console.error("Failed to save default model:", error);
    }
}

export async function getFavoriteModels(): Promise<string[]> {
    try {
        const stored = await SecureStore.getItemAsync(FAVORITE_MODELS_KEY);
        if (!stored) return [];
        const parsed = JSON.parse(stored);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter((modelId) => typeof modelId === "string");
    } catch {
        return [];
    }
}

export async function setFavoriteModels(models: string[]): Promise<void> {
    try {
        await SecureStore.setItemAsync(
            FAVORITE_MODELS_KEY,
            JSON.stringify(models),
        );
    } catch (error) {
        console.error("Failed to save favorite models:", error);
    }
}
