"use client";

import {
    ConvexProvider as BaseConvexProvider,
    ConvexReactClient,
} from "convex/react";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import {
    createContext,
    useContext,
    useMemo,
    useEffect,
    useState,
    type ReactNode,
} from "react";
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
    const [mounted, setMounted] = useState(false);
    const [clientKey, setClientKey] = useState(0);

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        if (!mounted) return;

        const checkAndReload = () => {
            const jwtKey = Object.keys(localStorage).find((k) =>
                k.startsWith("__convexAuthJWT_"),
            );
            const token = jwtKey ? localStorage.getItem(jwtKey) : null;

            if (token && token !== localStorage.getItem("_lastUsedToken")) {
                localStorage.setItem("_lastUsedToken", token);
                setClientKey((k) => k + 1);
            }
        };

        checkAndReload();
        const interval = setInterval(checkAndReload, 2000);
        return () => clearInterval(interval);
    }, [mounted]);

    const convexClient = useMemo(() => {
        if (!mounted || !isConvexConfigured()) {
            return null;
        }

        const url = getConvexUrl();
        if (!url) {
            return null;
        }

        try {
            return new ConvexReactClient(url);
        } catch {
            return null;
        }
    }, [mounted, clientKey]);

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
