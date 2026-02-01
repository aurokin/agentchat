import React, {
    createContext,
    useContext,
    useCallback,
    useSyncExternalStore,
    type ReactNode,
} from "react";
import {
    getHasCompletedOnboarding,
    setHasCompletedOnboarding,
} from "../lib/storage";

interface AppContextValue {
    isInitialized: boolean;
    hasCompletedOnboarding: boolean;
    initializeApp: () => Promise<void>;
    completeOnboarding: () => Promise<void>;
}

interface OnboardingSnapshot {
    isInitialized: boolean;
    hasCompletedOnboarding: boolean;
}

const AppContext = createContext<AppContextValue | null>(null);

export function useAppContext(): AppContextValue {
    const context = useContext(AppContext);
    if (!context) {
        throw new Error("useAppContext must be used within AppProvider");
    }
    return context;
}

interface AppProviderProps {
    children: ReactNode;
}

const onboardingStore = (() => {
    let snapshot: OnboardingSnapshot = {
        isInitialized: false,
        hasCompletedOnboarding: false,
    };
    const listeners = new Set<() => void>();
    let initPromise: Promise<void> | null = null;

    const notify = () => {
        listeners.forEach((listener) => listener());
    };

    const initialize = async () => {
        try {
            const onboardingCompleted = await getHasCompletedOnboarding();
            snapshot = {
                isInitialized: true,
                hasCompletedOnboarding: onboardingCompleted,
            };
        } catch {
            snapshot = { ...snapshot, isInitialized: true };
        }
        notify();
    };

    const ensureInitialized = () => {
        if (!initPromise) {
            initPromise = initialize();
        }
        return initPromise;
    };

    return {
        subscribe(listener: () => void) {
            listeners.add(listener);
            void ensureInitialized();
            return () => {
                listeners.delete(listener);
            };
        },
        getSnapshot() {
            return snapshot;
        },
        getServerSnapshot() {
            return snapshot;
        },
        async refresh() {
            initPromise = null;
            await ensureInitialized();
        },
        async completeOnboarding() {
            snapshot = { isInitialized: true, hasCompletedOnboarding: true };
            notify();
            await setHasCompletedOnboarding();
        },
    };
})();

export function AppProvider({
    children,
}: AppProviderProps): React.ReactElement {
    const snapshot = useSyncExternalStore(
        onboardingStore.subscribe,
        onboardingStore.getSnapshot,
        onboardingStore.getServerSnapshot,
    );

    const initializeApp = useCallback(async () => {
        await onboardingStore.refresh();
    }, []);

    const completeOnboarding = useCallback(async () => {
        await onboardingStore.completeOnboarding();
    }, []);

    return (
        <AppContext.Provider
            value={{
                isInitialized: snapshot.isInitialized,
                hasCompletedOnboarding: snapshot.hasCompletedOnboarding,
                initializeApp,
                completeOnboarding,
            }}
        >
            {children}
        </AppContext.Provider>
    );
}
