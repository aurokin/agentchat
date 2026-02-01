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
        expect(await storage.getDefaultThinking()).toBe("none");
        expect(await storage.getDefaultSearchLevel()).toBe("none");
        expect(await storage.getDefaultModel()).toBeNull();
    });

    it("handles legacy true/false search values", async () => {
        store.set("routerchat-default-search", "true");
        expect(await storage.getDefaultSearchLevel()).toBe("medium");

        store.set("routerchat-default-search", "false");
        expect(await storage.getDefaultSearchLevel()).toBe("none");
    });

    it("filters favorite model list entries", async () => {
        store.set(
            "routerchat-favorite-models",
            JSON.stringify(["model-a", 123, null, "model-b"]),
        );

        expect(await storage.getFavoriteModels()).toEqual([
            "model-a",
            "model-b",
        ]);
    });
});
