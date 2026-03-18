import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

import { __setStore } from "../secure-store";

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

__setStore({ getItemAsync, setItemAsync, deleteItemAsync });

const credentialStorage = await import("../credential-storage");
let originalConsoleError: typeof console.error;
let consoleErrorMock: ReturnType<typeof mock> | null = null;

describe("credential-storage", () => {
    beforeEach(() => {
        store.clear();
        getItemAsync.mockClear();
        setItemAsync.mockClear();
        deleteItemAsync.mockClear();
        originalConsoleError = console.error;
        consoleErrorMock = mock(() => undefined);
        console.error = consoleErrorMock as unknown as typeof console.error;
    });

    afterEach(() => {
        console.error = originalConsoleError;
        consoleErrorMock = null;
    });

    it("returns null when SecureStore get fails", async () => {
        getItemAsync.mockImplementationOnce(() => {
            throw new Error("boom");
        });

        expect(await credentialStorage.getAuthToken()).toBeNull();
    });

    it("stores tokens under the agentchat secure-store keys", async () => {
        await credentialStorage.setAuthToken("access-token");
        await credentialStorage.setRefreshToken("refresh-token");

        expect(store.get("agentchat-auth-token")).toBe("access-token");
        expect(store.get("agentchat-refresh-token")).toBe("refresh-token");
    });

    it("throws when SecureStore set fails", async () => {
        setItemAsync.mockImplementationOnce(() => {
            throw new Error("set-fail");
        });
        let caught: unknown;
        try {
            await credentialStorage.setAuthToken("token");
        } catch (error) {
            caught = error;
        }

        expect(caught).toBeInstanceOf(Error);
        expect((caught as Error).message).toBe("set-fail");
    });

    it("throws when SecureStore clear fails", async () => {
        deleteItemAsync.mockImplementationOnce(() => {
            throw new Error("clear-fail");
        });
        let caught: unknown;
        try {
            await credentialStorage.clearAuthToken();
        } catch (error) {
            caught = error;
        }

        expect(caught).toBeInstanceOf(Error);
        expect((caught as Error).message).toBe("clear-fail");
    });
});
