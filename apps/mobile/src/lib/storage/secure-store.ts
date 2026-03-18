// Thin indirection over expo-secure-store that tests can swap via
// `__setStore` without relying on Bun's mock.module (which has
// platform-specific issues with named export interception on Linux).

interface SecureStoreApi {
    getItemAsync(key: string, options?: Record<string, unknown>): Promise<string | null>;
    setItemAsync(key: string, value: string, options?: Record<string, unknown>): Promise<void>;
    deleteItemAsync(key: string, options?: Record<string, unknown>): Promise<void>;
}

let impl: SecureStoreApi | null = null;

function getImpl(): SecureStoreApi {
    if (!impl) {
        impl = require("expo-secure-store") as SecureStoreApi;
    }
    return impl;
}

export function getItemAsync(
    key: string,
    options?: Record<string, unknown>,
): Promise<string | null> {
    return getImpl().getItemAsync(key, options);
}

export function setItemAsync(
    key: string,
    value: string,
    options?: Record<string, unknown>,
): Promise<void> {
    return getImpl().setItemAsync(key, value, options);
}

export function deleteItemAsync(
    key: string,
    options?: Record<string, unknown>,
): Promise<void> {
    return getImpl().deleteItemAsync(key, options);
}

/** Test-only: swap the backing implementation. */
export function __setStore(store: SecureStoreApi): void {
    impl = store;
}