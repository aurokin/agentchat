import React, {
    createContext,
    useContext,
    useCallback,
    useSyncExternalStore,
    type ReactNode,
} from "react";
import { createOnboardingStore } from "@/contexts/onboarding-store";
import {
    getHasCompletedOnboarding,
    setHasCompletedOnboarding,
} from "@/lib/storage";

interface AppContextValue {
    isInitialized: boolean;
    hasCompletedOnboarding: boolean;
    initializeApp: () => Promise<void>;
    completeOnboarding: () => Promise<void>;
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

const onboardingStore = createOnboardingStore({
    getHasCompletedOnboarding,
    setHasCompletedOnboarding,
});

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
