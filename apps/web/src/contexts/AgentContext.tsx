"use client";

import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { useConvexAuth } from "convex/react";
import { api } from "@convex/_generated/api";
import type { FunctionReference } from "convex/server";

import {
    fetchAgentOptions,
    fetchBootstrap,
    type AgentOptionsResponse,
    type BootstrapAgent,
    type BootstrapAuthProvider,
    type BootstrapResponse,
} from "@/lib/agentchat-server";
import {
    type AgentchatServerIssue,
    toAgentchatServerIssue,
} from "@/lib/server-issues";
import * as storage from "@/lib/storage";
import { resolveSelectedAgentId } from "@/contexts/agent-helpers";
import { useActionSafe } from "@/hooks/useConvexSafe";

const convexApi = api as typeof api & {
    backendTokens: {
        issue: FunctionReference<"action">;
    };
};

export type BootstrapAuthState = "none" | "anonymous" | "authenticated";

interface AgentContextType {
    agents: BootstrapAgent[];
    authProviderId: string | null;
    authProviderKind: BootstrapAuthProvider["kind"] | null;
    authRequiresLogin: boolean;
    selectedAgentId: string | null;
    selectedAgent: BootstrapAgent | null;
    selectedAgentOptions: AgentOptionsResponse | null;
    loadingAgents: boolean;
    loadingAgentOptions: boolean;
    bootstrap: BootstrapResponse | null;
    bootstrapAuthState: BootstrapAuthState;
    bootstrapIssue: AgentchatServerIssue | null;
    agentOptionsIssue: AgentchatServerIssue | null;
    setSelectedAgentId: (agentId: string) => void;
    refreshBootstrap: () => Promise<void>;
}

const AgentContext = createContext<AgentContextType | null>(null);

export function AgentProvider({ children }: { children: React.ReactNode }) {
    const [bootstrap, setBootstrap] = useState<BootstrapResponse | null>(null);
    const [bootstrapAuthState, setBootstrapAuthState] =
        useState<BootstrapAuthState>("none");
    const [selectedAgentOptions, setSelectedAgentOptions] =
        useState<AgentOptionsResponse | null>(null);
    const [selectedAgentId, setSelectedAgentIdState] = useState<string | null>(
        null,
    );
    const [loadingAgents, setLoadingAgents] = useState(false);
    const [loadingAgentOptions, setLoadingAgentOptions] = useState(false);
    const [bootstrapIssue, setBootstrapIssue] =
        useState<AgentchatServerIssue | null>(null);
    const [agentOptionsIssue, setAgentOptionsIssue] =
        useState<AgentchatServerIssue | null>(null);

    const { isAuthenticated } = useConvexAuth();
    const issueBackendToken = useActionSafe(convexApi.backendTokens.issue);
    const bootstrapRef = useRef<BootstrapResponse | null>(null);
    const bootstrapAuthStateRef = useRef<BootstrapAuthState>("none");
    const backendTokenRef = useRef<string | null>(null);
    const isAuthenticatedRef = useRef(isAuthenticated);
    isAuthenticatedRef.current = isAuthenticated;

    const refreshBootstrap = useCallback(async (token?: string | null) => {
        const nextBootstrapAuthState: BootstrapAuthState = token
            ? "authenticated"
            : "anonymous";

        setLoadingAgents(true);
        try {
            const nextBootstrap = await fetchBootstrap(token);
            if (
                nextBootstrapAuthState === "anonymous" &&
                (bootstrapAuthStateRef.current === "authenticated" ||
                    isAuthenticatedRef.current)
            ) {
                return;
            }

            setBootstrapIssue(null);
            bootstrapRef.current = nextBootstrap;
            bootstrapAuthStateRef.current = nextBootstrapAuthState;
            setBootstrap(nextBootstrap);
            setBootstrapAuthState(nextBootstrapAuthState);

            const nextSelectedAgentId = resolveSelectedAgentId({
                agents: nextBootstrap.agents,
                storedAgentId: storage.getSelectedAgentId(),
            });

            setSelectedAgentIdState(nextSelectedAgentId);
            if (nextSelectedAgentId) {
                storage.setSelectedAgentId(nextSelectedAgentId);
            } else {
                storage.clearSelectedAgentId();
            }
        } catch (error) {
            if (
                nextBootstrapAuthState === "anonymous" &&
                (bootstrapAuthStateRef.current === "authenticated" ||
                    isAuthenticatedRef.current)
            ) {
                return;
            }

            console.error("Failed to load Agentchat bootstrap:", error);
            setBootstrapIssue(
                toAgentchatServerIssue({
                    scope: "bootstrap",
                    error,
                }),
            );

            if (bootstrapRef.current) {
                return;
            }

            const fallbackBootstrap: BootstrapResponse = {
                auth: {
                    defaultProviderId: "google-main",
                    requiresLogin: true,
                    activeProvider: {
                        id: "google-main",
                        kind: "google",
                        enabled: true,
                        allowlistMode: "email",
                        allowSignup: null,
                    },
                    providers: [
                        {
                            id: "google-main",
                            kind: "google",
                            enabled: true,
                            allowlistMode: "email",
                            allowSignup: null,
                        },
                    ],
                },
                agents: [],
                providers: [],
            };
            bootstrapRef.current = fallbackBootstrap;
            bootstrapAuthStateRef.current = "anonymous";
            setBootstrap(fallbackBootstrap);
            setBootstrapAuthState("anonymous");
            setSelectedAgentIdState(null);
            storage.clearSelectedAgentId();
        } finally {
            setLoadingAgents(false);
        }
    }, []);

    const refreshAuthenticatedBootstrap = useCallback(
        async (shouldCancel: () => boolean = () => false) => {
            try {
                const result = await issueBackendToken({} as any);
                if (shouldCancel()) return;

                const token = (result as any)?.token;
                if (!token) {
                    throw new Error(
                        "Backend token response did not include a token.",
                    );
                }

                backendTokenRef.current = token;
                await refreshBootstrap(token);
            } catch (error) {
                if (shouldCancel()) return;
                console.error(
                    "Failed to issue backend token for bootstrap:",
                    error,
                );
                setBootstrapIssue(
                    toAgentchatServerIssue({
                        scope: "bootstrap",
                        error,
                    }),
                );
            }
        },
        [issueBackendToken, refreshBootstrap],
    );

    const refreshBootstrapForCurrentAuth = useCallback(async () => {
        if (!isAuthenticated) {
            backendTokenRef.current = null;
            await refreshBootstrap();
            return;
        }

        await refreshAuthenticatedBootstrap();
    }, [isAuthenticated, refreshAuthenticatedBootstrap, refreshBootstrap]);

    // Initial unauthenticated bootstrap (for auth config / login page)
    useEffect(() => {
        void refreshBootstrap();
    }, [refreshBootstrap]);

    // Re-fetch bootstrap with backend token once authenticated
    useEffect(() => {
        if (!isAuthenticated) return;

        let cancelled = false;
        void refreshAuthenticatedBootstrap(() => cancelled);

        return () => {
            cancelled = true;
        };
    }, [isAuthenticated, refreshAuthenticatedBootstrap]);

    const setSelectedAgentId = useCallback(
        (agentId: string) => {
            if (!bootstrap?.agents.some((agent) => agent.id === agentId)) {
                return;
            }

            setSelectedAgentIdState(agentId);
            storage.setSelectedAgentId(agentId);
        },
        [bootstrap?.agents],
    );

    const selectedAgent = useMemo(() => {
        if (!bootstrap || !selectedAgentId) {
            return null;
        }

        return (
            bootstrap.agents.find((agent) => agent.id === selectedAgentId) ??
            null
        );
    }, [bootstrap, selectedAgentId]);

    useEffect(() => {
        if (!selectedAgentId) {
            setSelectedAgentOptions(null);
            setLoadingAgentOptions(false);
            return;
        }

        let cancelled = false;
        setLoadingAgentOptions(true);

        void fetchAgentOptions(selectedAgentId, backendTokenRef.current)
            .then((options) => {
                if (cancelled) return;
                setAgentOptionsIssue(null);
                setSelectedAgentOptions(options);
            })
            .catch((error) => {
                if (cancelled) return;
                console.error("Failed to load agent options:", error);
                setAgentOptionsIssue(
                    toAgentchatServerIssue({
                        scope: "agentOptions",
                        error,
                    }),
                );
                setSelectedAgentOptions(null);
            })
            .finally(() => {
                if (cancelled) return;
                setLoadingAgentOptions(false);
            });

        return () => {
            cancelled = true;
        };
    }, [selectedAgentId]);

    return (
        <AgentContext.Provider
            value={{
                agents: bootstrap?.agents ?? [],
                authProviderId: bootstrap?.auth.activeProvider?.id ?? null,
                authProviderKind:
                    bootstrap?.auth.activeProvider?.kind ?? "google",
                authRequiresLogin: bootstrap?.auth.requiresLogin ?? true,
                selectedAgentId,
                selectedAgent,
                selectedAgentOptions,
                loadingAgents,
                loadingAgentOptions,
                bootstrap,
                bootstrapAuthState,
                bootstrapIssue,
                agentOptionsIssue,
                setSelectedAgentId,
                refreshBootstrap: refreshBootstrapForCurrentAuth,
            }}
        >
            {children}
        </AgentContext.Provider>
    );
}

export function useAgent() {
    const context = useContext(AgentContext);
    if (!context) {
        throw new Error("useAgent must be used within an AgentProvider");
    }
    return context;
}
