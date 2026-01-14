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

interface SafeConvexProviderProps {
    children: ReactNode;
}

export function SafeConvexProvider({ children }: SafeConvexProviderProps) {
    const convexClient = useMemo(() => {
        if (!isConvexConfigured()) {
            return null;
        }

        const url = getConvexUrl();
        if (!url) {
            return null;
        }

        try {
            return new ConvexReactClient(url);
        } catch (error) {
            console.warn("Failed to initialize Convex client:", error);
            return null;
        }
    }, []);

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
