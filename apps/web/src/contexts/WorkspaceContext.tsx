"use client";

import React, { createContext, useContext, useMemo } from "react";
import { useConvex, useConvexAuth, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { WorkspaceStatus } from "@/lib/sync/types";
import type { PersistenceAdapter } from "@/lib/sync/persistence-adapter";
import { ConvexPersistenceAdapter } from "@/lib/sync/convex-adapter";
import type { ConvexClientInterface, ConvexId } from "@/lib/sync/convex-types";
import { useIsConvexAvailable } from "@/contexts/ConvexProvider";
import { unavailablePersistenceAdapter } from "@/lib/sync/unavailable-adapter";

interface WorkspaceContextType {
    workspaceStatus: WorkspaceStatus;
    isWorkspaceReady: boolean;
    isConvexAvailable: boolean;
    persistenceAdapter: PersistenceAdapter;
}

const WorkspaceContext = createContext<WorkspaceContextType | null>(null);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
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

    const contextValue = useMemo<WorkspaceContextType>(
        () => ({
            workspaceStatus,
            isWorkspaceReady,
            isConvexAvailable,
            persistenceAdapter,
        }),
        [
            isConvexAvailable,
            isWorkspaceReady,
            persistenceAdapter,
            workspaceStatus,
        ],
    );

    return (
        <WorkspaceContext.Provider value={contextValue}>
            {children}
        </WorkspaceContext.Provider>
    );
}

export function useWorkspace(): WorkspaceContextType {
    const context = useContext(WorkspaceContext);
    if (!context) {
        throw new Error("useWorkspace must be used within WorkspaceProvider");
    }
    return context;
}

export function usePersistenceAdapter(): PersistenceAdapter {
    const { persistenceAdapter } = useWorkspace();
    return persistenceAdapter;
}
