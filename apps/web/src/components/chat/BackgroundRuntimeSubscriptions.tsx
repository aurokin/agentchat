"use client";

import { useEffect, useMemo, useRef } from "react";
import { useQuery } from "convex/react";
import type { FunctionReference } from "convex/server";
import { api } from "@convex/_generated/api";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { getSharedAgentchatSocketClient } from "@/lib/agentchat-socket";
import { useActionSafe } from "@/hooks/useConvexSafe";
import {
    clearBackgroundConversationSubscriptions,
    reconcileBackgroundConversationSubscriptions,
} from "@shared/core/background-runtime-subscriptions";

const convexApi = api as typeof api & {
    backendTokens: {
        issue: FunctionReference<"action">;
    };
    runtimeBindings: {
        listActiveConversationIds: FunctionReference<"query">;
    };
};

type ActiveConversationSubscription = {
    conversationId: string;
    agentId: string;
};

export function BackgroundRuntimeSubscriptions() {
    const { isWorkspaceReady } = useWorkspace();
    const socketClient = useMemo(() => getSharedAgentchatSocketClient(), []);
    const issueBackendSessionToken = useActionSafe(
        convexApi.backendTokens.issue,
    );
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
        if (!isWorkspaceReady || !activeConversations) {
            clearBackgroundConversationSubscriptions(subscriptionsRef.current);
            return;
        }

        const activeCount = reconcileBackgroundConversationSubscriptions({
            subscriptions: subscriptionsRef.current,
            desiredConversationIds: activeConversations.map(
                (entry) => entry.conversationId,
            ),
            subscribeToConversation: (conversationId) =>
                socketClient.subscribeToConversation(conversationId),
        });

        if (activeCount === 0) {
            return;
        }

        void socketClient
            .ensureConnected(async () => {
                const result = await issueBackendSessionToken({});
                if (!result || typeof result.token !== "string") {
                    throw new Error(
                        "Unable to create an authenticated Agentchat server session.",
                    );
                }
                return result.token;
            })
            .catch((error) => {
                console.error(
                    "Failed to connect Agentchat socket for background subscriptions:",
                    error,
                );
            });
    }, [
        activeConversations,
        isWorkspaceReady,
        issueBackendSessionToken,
        socketClient,
    ]);

    return null;
}
