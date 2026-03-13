import React, { createContext, useContext, useMemo } from "react";
import { useConvex, useConvexAuth, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
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
import { unavailablePersistenceAdapter } from "@/lib/workspace/unavailable-adapter";

interface WorkspaceContextValue {
    workspaceStatus: WorkspaceStatus;
    isWorkspaceReady: boolean;
    isConvexAvailable: boolean;
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
    const { isAuthenticated } = useConvexAuth();
    const userId = useQuery(
        api.users.getCurrentUserId,
        isConvexAvailable && isAuthenticated ? {} : "skip",
    ) as ConvexId<"users"> | null | undefined;

    const workspaceStatus: WorkspaceStatus =
        isConvexAvailable && isAuthenticated && userId
            ? "ready"
            : "unavailable";
    const isWorkspaceReady = workspaceStatus === "ready";

    const persistenceAdapter = useMemo<PersistenceAdapter>(() => {
        if (!isConvexAvailable || !userId) {
            return unavailablePersistenceAdapter;
        }
        return new ConvexPersistenceAdapter(convexClient, userId);
    }, [convexClient, isConvexAvailable, userId]);

    const contextValue = useMemo(
        () => ({
            workspaceStatus,
            isWorkspaceReady,
            isConvexAvailable,
            persistenceAdapter,
            isInitialSyncLoaded: !isAuthenticated || userId !== undefined,
        }),
        [
            isAuthenticated,
            isConvexAvailable,
            isWorkspaceReady,
            persistenceAdapter,
            userId,
            workspaceStatus,
        ],
    );

    return (
        <WorkspaceContext.Provider value={contextValue}>
            {children}
        </WorkspaceContext.Provider>
    );
}
