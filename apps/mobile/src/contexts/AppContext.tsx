import React, {
    createContext,
    useContext,
    useEffect,
    useState,
    useCallback,
    type ReactNode,
} from "react";
import type { SyncState, SyncMetadata } from "@shared/core/sync";
import { DEFAULT_SYNC_METADATA } from "@shared/core/sync";
import { getSqliteStorageAdapter } from "../lib/sync/sqlite-adapter";
import { getSyncState, setSyncState } from "../lib/storage";
import { isConvexConfigured } from "../lib/convex";

interface AppContextValue {
    syncState: SyncState;
    syncMetadata: SyncMetadata;
    isInitialized: boolean;
    isConvexAvailable: boolean;
    setSyncState: (state: SyncState) => Promise<void>;
    initializeApp: () => Promise<void>;
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
    const [syncState, setSyncStateValue] = useState<SyncState>("local-only");
    const [syncMetadata] = useState<SyncMetadata>(DEFAULT_SYNC_METADATA);
    const [isInitialized, setIsInitialized] = useState(false);
    const [isConvexAvailable, setIsConvexAvailable] = useState(false);

    const initializeApp = useCallback(async () => {
        const convexAvailable = isConvexConfigured();
        setIsConvexAvailable(convexAvailable);

        if (convexAvailable) {
            const storedState = await getSyncState();
            if (
                storedState === "local-only" ||
                storedState === "cloud-enabled" ||
                storedState === "cloud-disabled"
            ) {
                setSyncStateValue(storedState);
            }
        }

        setIsInitialized(true);
    }, []);

    const setSyncState = useCallback(async (newState: SyncState) => {
        setSyncStateValue(newState);
        await setSyncState(newState);
    }, []);

    useEffect(() => {
        initializeApp();
    }, [initializeApp]);

    return (
        <AppContext.Provider
            value={{
                syncState,
                syncMetadata,
                isInitialized,
                isConvexAvailable,
                setSyncState,
                initializeApp,
            }}
        >
            {children}
        </AppContext.Provider>
    );
}
