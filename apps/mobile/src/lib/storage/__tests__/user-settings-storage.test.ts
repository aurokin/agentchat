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

await mock.module("expo-secure-store", () => ({
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
});
