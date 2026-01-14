"use client";

import {
    ConvexProvider as BaseConvexProvider,
    ConvexReactClient,
} from "convex/react";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { isConvexConfigured, getConvexUrl } from "@/lib/sync/config";

interface ConvexAvailabilityContextType {
    isAvailable: boolean;
    client: ConvexReactClient | null;
}

const ConvexAvailabilityContext =
    createContext<ConvexAvailabilityContextType | null>(null);

// Module-level singleton for Convex client (recommended pattern)
let convexClientSingleton: ConvexReactClient | null = null;

function getConvexClient(): ConvexReactClient | null {
    if (typeof window === "undefined" || !isConvexConfigured()) {
        return null;
    }

    if (convexClientSingleton) {
        return convexClientSingleton;
    }

    const url = getConvexUrl();
    if (!url) {
        return null;
    }

    try {
        convexClientSingleton = new ConvexReactClient(url);
        return convexClientSingleton;
    } catch {
        return null;
    }
}

interface SafeConvexProviderProps {
    children: ReactNode;
}

export function SafeConvexProvider({ children }: SafeConvexProviderProps) {
    const convexClient = getConvexClient();

    const availabilityValue = useMemo(
        () => ({
            isAvailable: convexClient !== null,
            client: convexClient,
        }),
        [convexClient],
    );

    if (!convexClient) {
        return (
            <ConvexAvailabilityContext.Provider value={availabilityValue}>
                <BaseConvexProvider client={convexClient as any}>
                    {children}
                </BaseConvexProvider>
            </ConvexAvailabilityContext.Provider>
        );
    }

    return (
        <ConvexAvailabilityContext.Provider value={availabilityValue}>
            <ConvexAuthProvider client={convexClient}>
                <BaseConvexProvider client={convexClient}>
                    {children}
                </BaseConvexProvider>
            </ConvexAuthProvider>
        </ConvexAvailabilityContext.Provider>
    );
}

export function useConvexAvailability(): ConvexAvailabilityContextType {
    const context = useContext(ConvexAvailabilityContext);
    if (!context) {
        return { isAvailable: false, client: null };
    }
    return context;
}

export function useIsConvexAvailable(): boolean {
    const { isAvailable } = useConvexAvailability();
    return isAvailable;
}
