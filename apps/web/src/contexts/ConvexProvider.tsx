"use client";

import { ConvexReactClient } from "convex/react";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { createContext, useContext, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { isConvexConfigured, getConvexUrl } from "@/lib/sync/config";

interface ConvexAvailabilityContextType {
    isAvailable: boolean;
}

const ConvexAvailabilityContext =
    createContext<ConvexAvailabilityContextType | null>(null);

// Module-level singleton for Convex client
let convexClient: ConvexReactClient | null = null;

function getClient(): ConvexReactClient | null {
    if (typeof window === "undefined") return null;
    if (!isConvexConfigured()) return null;

    if (!convexClient) {
        const url = getConvexUrl();
        if (url) {
            convexClient = new ConvexReactClient(url, {
                skipConvexDeploymentUrlCheck: url.includes(".convex.site"),
            });
        }
    }
    return convexClient;
}

interface SafeConvexProviderProps {
    children: ReactNode;
}

export function SafeConvexProvider({ children }: SafeConvexProviderProps) {
    const client = getClient();

    // When Convex is not configured, just render children without provider
    if (!client) {
        return (
            <ConvexAvailabilityContext.Provider value={{ isAvailable: false }}>
                {children}
            </ConvexAvailabilityContext.Provider>
        );
    }

    return (
        <ConvexAvailabilityContext.Provider value={{ isAvailable: true }}>
            <AuthAwareConvexProvider client={client}>
                {children}
            </AuthAwareConvexProvider>
        </ConvexAvailabilityContext.Provider>
    );
}

function AuthAwareConvexProvider({
    client,
    children,
}: {
    client: ConvexReactClient;
    children: ReactNode;
}) {
    const router = useRouter();

    const storageNamespace = getConvexUrl() ?? (client as any).address;

    return (
        <ConvexAuthProvider
            client={client}
            storageNamespace={storageNamespace}
            replaceURL={(url) => router.replace(url)}
        >
            {children}
        </ConvexAuthProvider>
    );
}

export function useIsConvexAvailable(): boolean {
    const context = useContext(ConvexAvailabilityContext);
    return context?.isAvailable ?? false;
}
