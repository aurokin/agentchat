"use client";

import { ConvexReactClient } from "convex/react";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { createContext, useContext, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { isConvexConfigured, getConvexUrl } from "@/lib/workspace/config";

interface ConvexAvailabilityContextType {
    isAvailable: boolean;
}

const ConvexAvailabilityContext =
    createContext<ConvexAvailabilityContextType | null>(null);

// Module-level singleton for Convex client
let convexClient: ConvexReactClient | null = null;
let fallbackConvexClient: ConvexReactClient | null = null;

const FALLBACK_CONVEX_URL = "http://127.0.0.1:3210";

function getClient(): ConvexReactClient | null {
    if (typeof window === "undefined") return null;
    if (!isConvexConfigured()) return null;

    if (!convexClient) {
        const url = getConvexUrl();
        if (url) {
            convexClient = new ConvexReactClient(url);
        }
    }
    return convexClient;
}

function getFallbackClient(): ConvexReactClient {
    if (!fallbackConvexClient) {
        fallbackConvexClient = new ConvexReactClient(FALLBACK_CONVEX_URL);
    }
    return fallbackConvexClient;
}

interface SafeConvexProviderProps {
    children: ReactNode;
}

export function SafeConvexProvider({ children }: SafeConvexProviderProps) {
    const client = getClient();
    const providerClient = client ?? getFallbackClient();

    return (
        <ConvexAvailabilityContext.Provider
            value={{ isAvailable: Boolean(client) }}
        >
            <AuthAwareConvexProvider client={providerClient}>
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

    const replaceURL = (url: string) => {
        if (typeof window === "undefined") {
            router.replace(url);
            return;
        }

        try {
            const target = new URL(url, window.location.href);
            if (target.origin === window.location.origin) {
                const nextPath = `${target.pathname}${target.search}${target.hash}`;
                router.replace(nextPath);
                return;
            }
        } catch {
            router.replace(url);
            return;
        }

        window.location.assign(url);
    };

    return (
        <ConvexAuthProvider client={client} replaceURL={replaceURL}>
            {children}
        </ConvexAuthProvider>
    );
}

export function useIsConvexAvailable(): boolean {
    const context = useContext(ConvexAvailabilityContext);
    return context?.isAvailable ?? false;
}
