import React, { createContext, useContext, useMemo } from "react";
import { ConvexReactClient } from "convex/react";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import * as SecureStore from "expo-secure-store";
import { getConvexUrl, isConvexConfigured } from "@/lib/convex/config";

interface ConvexAvailabilityContextValue {
    isAvailable: boolean;
}

const ConvexAvailabilityContext =
    createContext<ConvexAvailabilityContextValue | null>(null);

const FALLBACK_CONVEX_URL = "http://127.0.0.1:3210";

const secureStoreStorage = {
    getItem: (key: string) => SecureStore.getItemAsync(key),
    setItem: (key: string, value: string) =>
        SecureStore.setItemAsync(key, value),
    removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

export function ConvexProvider({
    children,
}: {
    children: React.ReactNode;
}): React.ReactElement {
    const url = getConvexUrl();
    const isAvailable = isConvexConfigured();
    const client = useMemo(() => {
        const address = url ?? FALLBACK_CONVEX_URL;
        return new ConvexReactClient(address);
    }, [url]);

    return (
        <ConvexAvailabilityContext.Provider value={{ isAvailable }}>
            <ConvexAuthProvider
                client={client}
                storage={secureStoreStorage}
                replaceURL={() => {}}
                shouldHandleCode={false}
            >
                {children}
            </ConvexAuthProvider>
        </ConvexAvailabilityContext.Provider>
    );
}

export function useIsConvexAvailable(): boolean {
    const context = useContext(ConvexAvailabilityContext);
    return context?.isAvailable ?? false;
}
