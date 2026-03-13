import React, {
    createContext,
    startTransition,
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
        await socketClient.ensureConnected(getBackendSessionToken);
    }, [getBackendSessionToken, socketClient]);

    useEffect(() => {
        let cancelled = false;

        if (!isAuthenticated || !isConfigured) {
            socketClient.close();
            startTransition(() => {
                setConnectionState("idle");
                setConnectionError(null);
            });
            return;
        }

        startTransition(() => {
            setConnectionState("connecting");
            setConnectionError(null);
        });

        void ensureConnected().then(
            () => {
                if (cancelled) return;
                setConnectionState("connected");
            },
            (error: unknown) => {
                if (cancelled) return;
                const message =
                    error instanceof Error
                        ? error.message
                        : "Failed to connect to the Agentchat server.";
                setConnectionState("error");
                setConnectionError(message);
            },
        );

        return () => {
            cancelled = true;
        };
    }, [ensureConnected, isAuthenticated, isConfigured, socketClient]);

    return (
        <AgentchatSocketContext.Provider
            value={{
                socketClient,
                connectionState,
                connectionError,
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
