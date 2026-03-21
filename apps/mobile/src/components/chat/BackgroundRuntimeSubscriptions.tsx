import { useEffect, useRef } from "react";
import { useQuery } from "convex/react";
import type { FunctionReference } from "convex/server";
import { api } from "@convex/_generated/api";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useAgentchatSocket } from "@/contexts/AgentchatSocketContext";
import {
    clearBackgroundConversationSubscriptions,
    reconcileBackgroundConversationSubscriptions,
} from "@shared/core/background-runtime-subscriptions";

const convexApi = api as typeof api & {
    runtimeBindings: {
        listActiveConversationIds: FunctionReference<"query">;
    };
};

type ActiveConversationSubscription = {
    conversationId: string;
    agentId: string;
};

export function BackgroundRuntimeSubscriptions(): null {
    const { isWorkspaceReady } = useWorkspace();
    const { socketClient, ensureConnected } = useAgentchatSocket();
    const activeConversations = useQuery(
        convexApi.runtimeBindings.listActiveConversationIds,
        isWorkspaceReady ? {} : "skip",
    ) as ActiveConversationSubscription[] | undefined;
    const subscriptionsRef = useRef<Map<string, () => void>>(new Map());

    useEffect(() => {
        const subscriptions = subscriptionsRef.current;
        return () => {
            clearBackgroundConversationSubscriptions(subscriptions);
        };
    }, []);

    useEffect(() => {
        if (!isWorkspaceReady) {
            clearBackgroundConversationSubscriptions(subscriptionsRef.current);
            return;
        }

        const activeCount = reconcileBackgroundConversationSubscriptions({
            subscriptions: subscriptionsRef.current,
            desiredConversations: activeConversations,
            subscribeToConversation: ({ conversationId, agentId }) =>
                socketClient.subscribeToConversation(conversationId, agentId),
        });

        if (activeCount === 0) {
            return;
        }

        void ensureConnected().catch((error) => {
            console.error(
                "Failed to connect Agentchat socket for background subscriptions:",
                error,
            );
        });
    }, [activeConversations, ensureConnected, isWorkspaceReady, socketClient]);

    return null;
}
