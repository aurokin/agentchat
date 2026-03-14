import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
} from "react";
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
    usesAutomaticAccessUser: boolean;
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

    const refreshBootstrap = useCallback(async () => {
        setLoadingAgents(true);
        try {
            const nextBootstrap = await fetchBootstrap();
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
    }, []);

    useEffect(() => {
        void refreshBootstrap();
    }, [refreshBootstrap]);

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

        void fetchAgentOptions(selectedAgentId)
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
                usesAutomaticAccessUser:
                    bootstrap?.auth.activeProvider?.kind === "disabled",
                selectedAgentId,
                selectedAgent,
                selectedAgentOptions,
                loadingAgents,
                loadingAgentOptions,
                bootstrap,
                setSelectedAgentId,
                refreshBootstrap,
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
