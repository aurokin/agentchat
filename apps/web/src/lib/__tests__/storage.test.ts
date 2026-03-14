import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import {
    clearSelectedChatId,
    clearSelectedAgentId,
    getDefaultModel,
    getDefaultThinking,
    getSelectedAgentId,
    getSelectedChatId,
    setDefaultModel,
    setDefaultThinking,
    setSelectedAgentId,
    setSelectedChatId,
    setTheme,
} from "@/lib/storage";

class MockLocalStorage implements Storage {
    private store = new Map<string, string>();

    get length(): number {
        return this.store.size;
    }

    clear(): void {
        this.store.clear();
    }

    getItem(key: string): string | null {
        return this.store.get(key) ?? null;
    }

    key(index: number): string | null {
        return Array.from(this.store.keys())[index] ?? null;
    }

    removeItem(key: string): void {
        this.store.delete(key);
    }

    setItem(key: string, value: string): void {
        this.store.set(key, value);
    }
}

describe("storage scoped defaults", () => {
    const originalWindow = globalThis.window;
    const originalLocalStorage = globalThis.localStorage;

    beforeEach(() => {
        const localStorage = new MockLocalStorage();
        globalThis.window = {} as Window & typeof globalThis;
        globalThis.localStorage = localStorage;
    });

    afterEach(() => {
        globalThis.window = originalWindow;
        globalThis.localStorage = originalLocalStorage;
    });

    test("falls back to the global default model when an agent-specific value is missing", () => {
        setDefaultModel("global-model");

        expect(getDefaultModel("agent-a")).toBe("global-model");
        expect(getDefaultModel()).toBe("global-model");
    });

    test("stores agent-specific model overrides independently", () => {
        setDefaultModel("global-model");
        setDefaultModel("agent-a-model", "agent-a");
        setDefaultModel("agent-b-model", "agent-b");

        expect(getDefaultModel("agent-a")).toBe("agent-a-model");
        expect(getDefaultModel("agent-b")).toBe("agent-b-model");
        expect(getDefaultModel()).toBe("global-model");
    });

    test("falls back to the global default thinking when an agent-specific value is missing", () => {
        setDefaultThinking("medium");

        expect(getDefaultThinking("agent-a")).toBe("medium");
        expect(getDefaultThinking()).toBe("medium");
    });

    test("defaults to low thinking when no preference is stored yet", () => {
        expect(getDefaultThinking()).toBe("low");
        expect(getDefaultThinking("agent-a")).toBe("low");
    });

    test("stores agent-specific thinking overrides independently", () => {
        setDefaultThinking("low");
        setDefaultThinking("high", "agent-a");
        setDefaultThinking("minimal", "agent-b");

        expect(getDefaultThinking("agent-a")).toBe("high");
        expect(getDefaultThinking("agent-b")).toBe("minimal");
        expect(getDefaultThinking()).toBe("low");
    });

    test("ignores malformed scoped storage values and falls back safely", () => {
        localStorage.setItem("agentchat-default-model-by-agent", "not-json");
        localStorage.setItem(
            "agentchat-default-thinking-by-agent",
            JSON.stringify({ "agent-a": "invalid" }),
        );
        setDefaultModel("global-model");
        setDefaultThinking("none");

        expect(getDefaultModel("agent-a")).toBe("global-model");
        expect(getDefaultThinking("agent-a")).toBe("none");
    });

    test("uses the agentchat namespace for top-level web storage keys", () => {
        setTheme("dark");
        setDefaultModel("global-model");
        setDefaultThinking("high");
        setSelectedAgentId("agent-a");
        setSelectedChatId("agent-a", "chat-1");

        expect(localStorage.getItem("agentchat-theme")).toBe("dark");
        expect(localStorage.getItem("agentchat-default-model")).toBe(
            "global-model",
        );
        expect(localStorage.getItem("agentchat-default-thinking")).toBe("high");
        expect(localStorage.getItem("agentchat-selected-agent")).toBe(
            "agent-a",
        );
        expect(localStorage.getItem("agentchat-selected-chat-by-agent")).toBe(
            JSON.stringify({ "agent-a": "chat-1" }),
        );
    });

    test("stores selected chat independently for each agent", () => {
        setSelectedChatId("agent-a", "chat-1");
        setSelectedChatId("agent-b", "chat-2");

        expect(getSelectedChatId("agent-a")).toBe("chat-1");
        expect(getSelectedChatId("agent-b")).toBe("chat-2");
    });

    test("can clear selected agent and selected chat state", () => {
        setSelectedAgentId("agent-a");
        setSelectedChatId("agent-a", "chat-1");

        clearSelectedAgentId();
        clearSelectedChatId("agent-a");

        expect(getSelectedAgentId()).toBeNull();
        expect(getSelectedChatId("agent-a")).toBeNull();
    });
});
