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

const syncStorage = await import("../sync-storage");

describe("sync-storage", () => {
    beforeEach(() => {
        store.clear();
        getItemAsync.mockClear();
        setItemAsync.mockClear();
        deleteItemAsync.mockClear();
    });

    it("returns null for invalid sync state", async () => {
        store.set("routerchat-sync-state", "not-json");
        expect(await syncStorage.getSyncState()).toBeNull();

        store.set("routerchat-sync-state", JSON.stringify("not-a-state"));
        expect(await syncStorage.getSyncState()).toBeNull();
    });

    it("merges stored sync metadata with defaults", async () => {
        store.set(
            "routerchat-sync-metadata",
            JSON.stringify({ lastSyncAt: 123 }),
        );

        const metadata = await syncStorage.getSyncMetadata();
        expect(metadata.lastSyncAt).toBe(123);
        expect(metadata.syncState).toBe("local-only");
        expect(metadata.cloudUserId).toBeNull();
        expect(metadata.migrationCompletedAt).toBeNull();
    });

    it("stores and clears cloud skill ids and modes", async () => {
        await syncStorage.setCloudDefaultSkillId("skill-1");
        expect(await syncStorage.getCloudDefaultSkillId()).toBe("skill-1");

        await syncStorage.setCloudDefaultSkillId(null);
        expect(await syncStorage.getCloudDefaultSkillId()).toBeNull();

        await syncStorage.setCloudSelectedSkillId("skill-2");
        expect(await syncStorage.getCloudSelectedSkillId()).toBe("skill-2");

        await syncStorage.setCloudSelectedSkillId(null);
        expect(await syncStorage.getCloudSelectedSkillId()).toBeNull();

        expect(await syncStorage.getCloudSelectedSkillMode()).toBe("auto");
        await syncStorage.setCloudSelectedSkillMode("manual");
        expect(await syncStorage.getCloudSelectedSkillMode()).toBe("manual");
    });
});
