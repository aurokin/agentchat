import React, {
    createContext,
    useContext,
    useEffect,
    useState,
    useCallback,
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

export function AppProvider({
    children,
}: AppProviderProps): React.ReactElement {
    const [isInitialized, setIsInitialized] = useState(false);
    const [hasCompletedOnboarding, setHasCompletedOnboardingState] =
        useState(false);

    const initializeApp = useCallback(async () => {
        const onboardingCompleted = await getHasCompletedOnboarding();
        setHasCompletedOnboardingState(onboardingCompleted);

        setIsInitialized(true);
    }, []);

    const completeOnboarding = useCallback(async () => {
        setHasCompletedOnboardingState(true);
        await setHasCompletedOnboarding();
    }, []);

    useEffect(() => {
        initializeApp();
    }, [initializeApp]);

    return (
        <AppContext.Provider
            value={{
                isInitialized,
                hasCompletedOnboarding,
                initializeApp,
                completeOnboarding,
            }}
        >
            {children}
        </AppContext.Provider>
    );
}
