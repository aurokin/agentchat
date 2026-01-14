"use client";

import {
    ConvexProvider as BaseConvexProvider,
    ConvexReactClient,
} from "convex/react";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { isConvexConfigured, getConvexUrl } from "@/lib/sync/config";

/**
 * Convex Availability Context
 *
 * Provides information about whether Convex is available.
 * This allows components to conditionally render cloud features.
 */
interface ConvexAvailabilityContextType {
    isAvailable: boolean;
    client: ConvexReactClient | null;
}

const ConvexAvailabilityContext =
    createContext<ConvexAvailabilityContextType | null>(null);

/**
 * Safe Convex Provider
 *
 * Wraps children with Convex provider only when properly configured.
 * When Convex is not available, renders children without Convex context,
 * allowing the app to function in local-only mode.
 */
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

    // Always provide the availability context
    if (!convexClient) {
        // No Convex - render children without Convex provider
        // App operates in local-only mode
        return (
            <ConvexAvailabilityContext.Provider value={availabilityValue}>
                {children}
            </ConvexAvailabilityContext.Provider>
        );
    }

    // Convex is available - wrap with both providers
    return (
        <ConvexAvailabilityContext.Provider value={availabilityValue}>
            <BaseConvexProvider client={convexClient}>
                {children}
            </BaseConvexProvider>
        </ConvexAvailabilityContext.Provider>
    );
}

/**
 * Hook to check if Convex is available
 */
export function useConvexAvailability(): ConvexAvailabilityContextType {
    const context = useContext(ConvexAvailabilityContext);
    if (!context) {
        // Outside of provider - assume not available
        return { isAvailable: false, client: null };
    }
    return context;
}

/**
 * Hook to check if Convex is available (simplified boolean)
 */
export function useIsConvexAvailable(): boolean {
    const { isAvailable } = useConvexAvailability();
    return isAvailable;
}
