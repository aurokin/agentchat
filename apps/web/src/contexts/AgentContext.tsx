"use client";

import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
} from "react";

import {
    fetchBootstrap,
    type BootstrapAgent,
    type BootstrapResponse,
} from "@/lib/agentchat-server";
import * as storage from "@/lib/storage";
import { resolveSelectedAgentId } from "@/contexts/agent-helpers";

interface AgentContextType {
    agents: BootstrapAgent[];
    selectedAgentId: string | null;
    selectedAgent: BootstrapAgent | null;
    loadingAgents: boolean;
    bootstrap: BootstrapResponse | null;
    setSelectedAgentId: (agentId: string) => void;
    refreshBootstrap: () => Promise<void>;
}

const AgentContext = createContext<AgentContextType | null>(null);

export function AgentProvider({ children }: { children: React.ReactNode }) {
    const [bootstrap, setBootstrap] = useState<BootstrapResponse | null>(null);
    const [selectedAgentId, setSelectedAgentIdState] = useState<string | null>(
        null,
    );
    const [loadingAgents, setLoadingAgents] = useState(false);

    const refreshBootstrap = useCallback(async () => {
        setLoadingAgents(true);
        try {
            const nextBootstrap = await fetchBootstrap();
            setBootstrap(nextBootstrap);

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
            console.error("Failed to load Agentchat bootstrap:", error);
            setBootstrap({ agents: [], providers: [] });
            setSelectedAgentIdState(null);
            storage.clearSelectedAgentId();
        } finally {
            setLoadingAgents(false);
        }
    }, []);

    useEffect(() => {
        void refreshBootstrap();
    }, [refreshBootstrap]);

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

    return (
        <AgentContext.Provider
            value={{
                agents: bootstrap?.agents ?? [],
                selectedAgentId,
                selectedAgent,
                loadingAgents,
                bootstrap,
                setSelectedAgentId,
                refreshBootstrap,
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
