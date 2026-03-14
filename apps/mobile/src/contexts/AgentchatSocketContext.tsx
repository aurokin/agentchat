import React, {
    createContext,
    useContext,
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from "react";
import { getAgentchatServerUrl } from "@/lib/agentchat-server";
import {
    getSharedAgentchatSocketClient,
    type AgentchatSocketClient,
} from "@/lib/agentchat-socket";
import { useAuthContext } from "@/lib/convex/AuthContext";

type SocketConnectionState = "idle" | "connecting" | "connected" | "error";

interface AgentchatSocketContextValue {
    socketClient: AgentchatSocketClient;
    connectionState: SocketConnectionState;
    connectionError: string | null;
    isConfigured: boolean;
    ensureConnected: () => Promise<void>;
}

const AgentchatSocketContext =
    createContext<AgentchatSocketContextValue | null>(null);

export function AgentchatSocketProvider({
    children,
}: {
    children: ReactNode;
}): React.ReactElement {
    const { isAuthenticated, getBackendSessionToken } = useAuthContext();
    const socketClient = useMemo(() => getSharedAgentchatSocketClient(), []);
    const [connectionState, setConnectionState] =
        useState<SocketConnectionState>("idle");
    const [connectionError, setConnectionError] = useState<string | null>(null);
    const isConfigured = Boolean(getAgentchatServerUrl());
    const ensureConnected = React.useCallback(async () => {
        if (!isAuthenticated || !isConfigured) {
            throw new Error("Agentchat server is not ready for mobile.");
        }

        setConnectionState("connecting");
        setConnectionError(null);

        try {
            await socketClient.ensureConnected(getBackendSessionToken);
            setConnectionState("connected");
        } catch (error) {
            const message =
                error instanceof Error
                    ? error.message
                    : "Failed to connect to the Agentchat server.";
            setConnectionState("error");
            setConnectionError(message);
            throw error;
        }
    }, [getBackendSessionToken, isAuthenticated, isConfigured, socketClient]);

    useEffect(() => {
        if (!isAuthenticated || !isConfigured) {
            socketClient.close();
        }
    }, [isAuthenticated, isConfigured, socketClient]);

    const effectiveConnectionState: SocketConnectionState =
        !isAuthenticated || !isConfigured ? "idle" : connectionState;
    const effectiveConnectionError =
        !isAuthenticated || !isConfigured ? null : connectionError;

    return (
        <AgentchatSocketContext.Provider
            value={{
                socketClient,
                connectionState: effectiveConnectionState,
                connectionError: effectiveConnectionError,
                isConfigured,
                ensureConnected,
            }}
        >
            {children}
        </AgentchatSocketContext.Provider>
    );
}

export function useAgentchatSocket(): AgentchatSocketContextValue {
    const context = useContext(AgentchatSocketContext);
    if (!context) {
        throw new Error(
            "useAgentchatSocket must be used within AgentchatSocketProvider",
        );
    }
    return context;
}
