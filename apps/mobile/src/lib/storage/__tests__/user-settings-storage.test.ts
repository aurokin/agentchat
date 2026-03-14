import { beforeEach, describe, expect, it, mock } from "bun:test";

const store = new Map<string, string>();

const getItemAsync = mock(async (key: string) => {
    return store.has(key) ? store.get(key)! : null;
});
const setItemAsync = mock(async (key: string, value: string) => {
    store.set(key, value);
});
const deleteItemAsync = mock(async (key: string) => {
    store.delete(key);
});

mock.module("expo-secure-store", () => ({
    getItemAsync,
    setItemAsync,
    deleteItemAsync,
}));

const storage = await import("../user-settings-storage");

describe("user-settings-storage", () => {
    beforeEach(() => {
        store.clear();
        getItemAsync.mockClear();
        setItemAsync.mockClear();
        deleteItemAsync.mockClear();
    });

    it("returns defaults when nothing stored", async () => {
        expect(await storage.getDefaultModel()).toBeNull();
    });

    it("stores agent-scoped provider, model, and variant independently", async () => {
        await storage.setDefaultModel("global-model");
        await storage.setDefaultModelForAgent("agent-model", "agent-1");
        await storage.setDefaultProviderForAgent("codex-primary", "agent-1");
        await storage.setDefaultVariantForAgent("balanced", "agent-1");

        expect(await storage.getDefaultModel()).toBe("global-model");
        expect(await storage.getDefaultProviderForAgent("agent-1")).toBe(
            "codex-primary",
        );
        expect(await storage.getDefaultModelForAgent("agent-1")).toBe(
            "agent-model",
        );
        expect(await storage.getDefaultVariantForAgent("agent-1")).toBe(
            "balanced",
        );
    });

    it("stores selected agent and selected chat by agent", async () => {
        await storage.setSelectedAgentId("agent-1");
        await storage.setSelectedChatId("agent-1", "chat-1");
        await storage.setSelectedChatId("agent-2", "chat-2");

        expect(await storage.getSelectedAgentId()).toBe("agent-1");
        expect(await storage.getSelectedChatId("agent-1")).toBe("chat-1");
        expect(await storage.getSelectedChatId("agent-2")).toBe("chat-2");

        await storage.clearSelectedChatId("agent-1");
        await storage.clearSelectedAgentId();

        expect(await storage.getSelectedChatId("agent-1")).toBeNull();
        expect(await storage.getSelectedAgentId()).toBeNull();
    });

    it("stores chat last-viewed timestamps by chat id", async () => {
        await storage.setChatLastViewedAt("chat-1", 123);
        await storage.setChatLastViewedAt("chat-2", 456);

        expect(await storage.getChatLastViewedAt("chat-1")).toBe(123);
        expect(await storage.getChatLastViewedAt("chat-2")).toBe(456);
        expect(await storage.getChatLastViewedAt("chat-3")).toBeNull();
    });

    it("filters favorite model list entries", async () => {
        store.set(
            "agentchat-favorite-models",
            JSON.stringify(["model-a", 123, null, "model-b"]),
        );

        expect(await storage.getFavoriteModels()).toEqual([
            "model-a",
            "model-b",
        ]);
    });
});
