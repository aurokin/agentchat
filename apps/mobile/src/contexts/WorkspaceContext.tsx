import React, { createContext, useContext, useMemo } from "react";
import { useConvex } from "convex/react";
import type {
    PersistenceAdapter,
    WorkspaceStatus,
} from "@shared/core/persistence";
import { ConvexPersistenceAdapter } from "@/lib/workspace/convex-adapter";
import type {
    ConvexClientInterface,
    ConvexId,
} from "@/lib/workspace/convex-types";
import { useIsConvexAvailable } from "@/lib/convex/ConvexProvider";
import { useAuthContext } from "@/lib/convex/AuthContext";
import { unavailablePersistenceAdapter } from "@/lib/workspace/unavailable-adapter";

interface WorkspaceContextValue {
    authMode: "google" | "disabled";
    isAuthRequired: boolean;
    workspaceStatus: WorkspaceStatus;
    isWorkspaceReady: boolean;
    isConvexAvailable: boolean;
    workspaceUserId: ConvexId<"users"> | null;
    persistenceAdapter: PersistenceAdapter;
    isInitialSyncLoaded: boolean;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function useWorkspace(): WorkspaceContextValue {
    const context = useContext(WorkspaceContext);
    if (!context) {
        throw new Error("useWorkspace must be used within a WorkspaceProvider");
    }
    return context;
}

export function usePersistenceAdapter(): PersistenceAdapter {
    return useWorkspace().persistenceAdapter;
}

export function WorkspaceProvider({
    children,
}: {
    children: React.ReactNode;
}): React.ReactElement {
    const isConvexAvailable = useIsConvexAvailable();
    const convexClient = useConvex() as unknown as ConvexClientInterface;
    const { authMode, isAuthDisabled, isAuthenticated, userId } =
        useAuthContext();
    const workspaceUserId = (userId as ConvexId<"users"> | null) ?? null;

    const workspaceStatus: WorkspaceStatus =
        isConvexAvailable && isAuthenticated && workspaceUserId
            ? "ready"
            : "unavailable";
    const isWorkspaceReady = workspaceStatus === "ready";

    const persistenceAdapter = useMemo<PersistenceAdapter>(() => {
        if (!isConvexAvailable || !workspaceUserId) {
            return unavailablePersistenceAdapter;
        }
        return new ConvexPersistenceAdapter(convexClient, workspaceUserId);
    }, [convexClient, isConvexAvailable, workspaceUserId]);

    const contextValue = useMemo(
        () => ({
            authMode,
            isAuthRequired: !isAuthDisabled,
            workspaceStatus,
            isWorkspaceReady,
            isConvexAvailable,
            workspaceUserId,
            persistenceAdapter,
            isInitialSyncLoaded:
                !isConvexAvailable || !isAuthenticated || !!workspaceUserId,
        }),
        [
            authMode,
            isAuthenticated,
            isAuthDisabled,
            isConvexAvailable,
            isWorkspaceReady,
            persistenceAdapter,
            workspaceUserId,
            workspaceStatus,
        ],
    );

    return (
        <WorkspaceContext.Provider value={contextValue}>
            {children}
        </WorkspaceContext.Provider>
    );
}
