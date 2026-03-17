import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { useAction, useConvexAuth } from "convex/react";
import { api } from "@convex/_generated/api";
import {
    fetchAgentOptions,
    fetchBootstrap,
    type AgentOptionsResponse,
    type BootstrapAgent,
    type BootstrapAuthProvider,
    type BootstrapResponse,
} from "@/lib/agentchat-server";
import {
    clearSelectedAgentId,
    getSelectedAgentId,
    setSelectedAgentId as persistSelectedAgentId,
} from "@/lib/storage";
import { resolveSelectedAgentId } from "@/contexts/agent-helpers";

interface AgentContextValue {
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
    setSelectedAgentId: (agentId: string) => Promise<void>;
    refreshBootstrap: () => Promise<void>;
}

const AgentContext = createContext<AgentContextValue | null>(null);

export function AgentProvider({
    children,
}: {
    children: React.ReactNode;
}): React.ReactElement {
    const [bootstrap, setBootstrap] = useState<BootstrapResponse | null>(null);
    const [selectedAgentOptions, setSelectedAgentOptions] =
        useState<AgentOptionsResponse | null>(null);
    const [selectedAgentId, setSelectedAgentIdState] = useState<string | null>(
        null,
    );
    const [loadingAgents, setLoadingAgents] = useState(false);
    const [loadingAgentOptions, setLoadingAgentOptions] = useState(false);

    const { isAuthenticated } = useConvexAuth();
    const issueBackendToken = useAction(api.backendTokens.issue);
    const backendTokenRef = useRef<string | null>(null);

    const refreshBootstrap = useCallback(
        async (token?: string | null) => {
            setLoadingAgents(true);
            try {
                const nextBootstrap = await fetchBootstrap(token);
                setBootstrap(nextBootstrap);

                const nextSelectedAgentId = resolveSelectedAgentId({
                    agents: nextBootstrap.agents,
                    storedAgentId: await getSelectedAgentId(),
                });

                setSelectedAgentIdState(nextSelectedAgentId);
                if (nextSelectedAgentId) {
                    await persistSelectedAgentId(nextSelectedAgentId);
                } else {
                    await clearSelectedAgentId();
                }
            } catch (error) {
                console.error("Failed to load Agentchat bootstrap:", error);
                setBootstrap({
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
                });
                setSelectedAgentIdState(null);
                await clearSelectedAgentId();
            } finally {
                setLoadingAgents(false);
            }
        },
        [],
    );

    // Initial unauthenticated bootstrap (for auth config / login page)
    useEffect(() => {
        void refreshBootstrap();
    }, [refreshBootstrap]);

    // Re-fetch bootstrap with backend token once authenticated
    useEffect(() => {
        if (!isAuthenticated) return;

        let cancelled = false;
        void (async () => {
            try {
                const result = await issueBackendToken({});
                if (cancelled || !result) return;
                backendTokenRef.current = (result as any).token;
                await refreshBootstrap((result as any).token);
            } catch (error) {
                console.error(
                    "Failed to issue backend token for bootstrap:",
                    error,
                );
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [isAuthenticated, issueBackendToken, refreshBootstrap]);

    const setSelectedAgentId = useCallback(
        async (agentId: string) => {
            if (!bootstrap?.agents.some((agent) => agent.id === agentId)) {
                return;
            }

            setSelectedAgentIdState(agentId);
            await persistSelectedAgentId(agentId);
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
                setSelectedAgentOptions(options);
            })
            .catch((error) => {
                if (cancelled) return;
                console.error("Failed to load agent options:", error);
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
                setSelectedAgentId,
                refreshBootstrap: () =>
                    refreshBootstrap(backendTokenRef.current),
            }}
        >
            {children}
        </AgentContext.Provider>
    );
}

export function useAgent(): AgentContextValue {
    const context = useContext(AgentContext);
    if (!context) {
        throw new Error("useAgent must be used within an AgentProvider");
    }
    return context;
}
