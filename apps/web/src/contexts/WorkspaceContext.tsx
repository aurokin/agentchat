"use client";

import React, {
    createContext,
    useContext,
    useEffect,
    useMemo,
    useState,
} from "react";
import { useConvex, useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { WorkspaceStatus } from "@/lib/workspace/types";
import type { PersistenceAdapter } from "@/lib/workspace/persistence-adapter";
import { ConvexPersistenceAdapter } from "@/lib/workspace/convex-adapter";
import type {
    ConvexClientInterface,
    ConvexId,
} from "@/lib/workspace/convex-types";
import { useIsConvexAvailable } from "@/contexts/ConvexProvider";
import { useAgent } from "@/contexts/AgentContext";
import { unavailablePersistenceAdapter } from "@/lib/workspace/unavailable-adapter";

interface WorkspaceContextType {
    authMode: "google" | "disabled";
    isAuthRequired: boolean;
    workspaceStatus: WorkspaceStatus;
    isWorkspaceReady: boolean;
    isConvexAvailable: boolean;
    workspaceUserId: ConvexId<"users"> | null;
    persistenceAdapter: PersistenceAdapter;
}

const WorkspaceContext = createContext<WorkspaceContextType | null>(null);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
    const isConvexAvailable = useIsConvexAvailable();
    const convexClient = useConvex() as unknown as ConvexClientInterface;
    const { isAuthenticated } = useConvexAuth();
    const { authMode, isAuthDisabled, loadingAgents } = useAgent();
    const ensureAccessUser = useMutation(api.users.ensureAccessUser);
    const [accessUserId, setAccessUserId] = useState<ConvexId<"users"> | null>(
        null,
    );
    const userId = useQuery(
        api.users.getCurrentUserId,
        isConvexAvailable &&
            !loadingAgents &&
            (isAuthDisabled || isAuthenticated)
            ? {}
            : "skip",
    ) as ConvexId<"users"> | null | undefined;

    useEffect(() => {
        let cancelled = false;

        if (!isConvexAvailable || loadingAgents || !isAuthDisabled) {
            return;
        }

        void ensureAccessUser({})
            .then((nextUserId) => {
                if (cancelled) return;
                setAccessUserId(nextUserId as ConvexId<"users">);
            })
            .catch((error) => {
                if (cancelled) return;
                console.error(
                    "Failed to initialize default access user:",
                    error,
                );
                setAccessUserId(null);
            });

        return () => {
            cancelled = true;
        };
    }, [ensureAccessUser, isAuthDisabled, isConvexAvailable, loadingAgents]);

    const workspaceUserId =
        (isAuthDisabled ? (accessUserId ?? userId) : userId) ?? null;

    const workspaceStatus: WorkspaceStatus =
        isConvexAvailable && workspaceUserId ? "ready" : "unavailable";
    const isWorkspaceReady = workspaceStatus === "ready";

    const persistenceAdapter = useMemo<PersistenceAdapter>(() => {
        if (!isConvexAvailable || !workspaceUserId) {
            return unavailablePersistenceAdapter;
        }
        return new ConvexPersistenceAdapter(convexClient, workspaceUserId);
    }, [convexClient, isConvexAvailable, workspaceUserId]);

    const contextValue = useMemo<WorkspaceContextType>(
        () => ({
            authMode,
            isAuthRequired: !isAuthDisabled,
            workspaceStatus,
            isWorkspaceReady,
            isConvexAvailable,
            workspaceUserId,
            persistenceAdapter,
        }),
        [
            authMode,
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
