"use client";

import { useEffect, useMemo, useRef } from "react";
import { useQuery } from "convex/react";
import type { FunctionReference } from "convex/server";
import { api } from "@convex/_generated/api";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { getSharedAgentchatSocketClient } from "@/lib/agentchat-socket";
import { useActionSafe } from "@/hooks/useConvexSafe";

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
            for (const unsubscribe of subscriptions.values()) {
                unsubscribe();
            }
            subscriptions.clear();
        };
    }, []);

    useEffect(() => {
        if (!isWorkspaceReady || !activeConversations) {
            for (const unsubscribe of subscriptionsRef.current.values()) {
                unsubscribe();
            }
            subscriptionsRef.current.clear();
            return;
        }

        const desiredConversationIds = new Set(
            activeConversations.map((entry) => entry.conversationId),
        );

        for (const [conversationId, unsubscribe] of subscriptionsRef.current) {
            if (desiredConversationIds.has(conversationId)) {
                continue;
            }

            unsubscribe();
            subscriptionsRef.current.delete(conversationId);
        }

        for (const conversationId of desiredConversationIds) {
            if (subscriptionsRef.current.has(conversationId)) {
                continue;
            }

            subscriptionsRef.current.set(
                conversationId,
                socketClient.subscribeToConversation(conversationId),
            );
        }

        if (desiredConversationIds.size === 0) {
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
