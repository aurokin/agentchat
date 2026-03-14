import { beforeEach, describe, expect, it, mock } from "bun:test";

const store = new Map<string, string>();

const getItemAsync = mock(async (key: string) => {
    return store.has(key) ? store.get(key)! : null;
});
const setItemAsync = mock(async (key: string, value: string) => {
    store.set(key, value);
});

mock.module("expo-secure-store", () => ({
    getItemAsync,
    setItemAsync,
}));

const storage = await import("../sync-storage");

describe("sync-storage", () => {
    beforeEach(() => {
        store.clear();
        getItemAsync.mockClear();
        setItemAsync.mockClear();
    });

    it("falls back to system theme when nothing is stored", async () => {
        expect(await storage.getTheme()).toBe("system");
    });

    it("treats legacy stored theme values as system until explicitly set", async () => {
        store.set("agentchat-theme", "light");

        expect(await storage.getTheme()).toBe("system");
    });

    it("stores theme under the agentchat secure-store key", async () => {
        await storage.setTheme("dark");

        expect(store.get("agentchat-theme")).toBe("dark");
        expect(store.get("agentchat-theme-selection-set")).toBe("true");
        expect(await storage.getTheme()).toBe("dark");
    });

    it("tracks onboarding completion in secure store", async () => {
        expect(await storage.getHasCompletedOnboarding()).toBe(false);

        await storage.setHasCompletedOnboarding();

        expect(store.get("agentchat-has-completed-onboarding")).toBe("true");
        expect(await storage.getHasCompletedOnboarding()).toBe(true);
    });
});
