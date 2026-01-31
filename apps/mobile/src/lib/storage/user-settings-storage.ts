import * as SecureStore from "expo-secure-store";
import type { ThinkingLevel, SearchLevel } from "@shared/core/types";

const DEFAULT_THINKING_KEY = "routerchat-default-thinking";
const DEFAULT_SEARCH_KEY = "routerchat-default-search";

const THINKING_LEVELS: ThinkingLevel[] = [
    "xhigh",
    "high",
    "medium",
    "low",
    "minimal",
    "none",
];

const SEARCH_LEVELS: SearchLevel[] = ["none", "low", "medium", "high"];

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

export async function getDefaultSearchLevel(): Promise<SearchLevel> {
    try {
        const stored = await SecureStore.getItemAsync(DEFAULT_SEARCH_KEY);
        if (stored === "true") return "medium";
        if (stored === "false" || stored === null) return "none";
        if (stored && SEARCH_LEVELS.includes(stored as SearchLevel)) {
            return stored as SearchLevel;
        }
        return "none";
    } catch {
        return "none";
    }
}

export async function setDefaultSearchLevel(value: SearchLevel): Promise<void> {
    try {
        await SecureStore.setItemAsync(DEFAULT_SEARCH_KEY, value);
    } catch (error) {
        console.error("Failed to save default search level:", error);
    }
}
