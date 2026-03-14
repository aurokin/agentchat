"use client";

import React, { useEffect, useState } from "react";
import { useConvexAuth } from "convex/react";
import { ChatLayout } from "@/components/chat/ChatLayout";
import { useChat } from "@/contexts/ChatContext";
import { useAgent } from "@/contexts/AgentContext";
import { useAuthActions } from "@convex-dev/auth/react";
import { Loader2 } from "lucide-react";
import { useIsConvexAvailable } from "@/contexts/ConvexProvider";
import { useSettings } from "@/contexts/SettingsContext";
import { OperatorNotice } from "@/components/chat/OperatorNotice";
import { useWorkspace } from "@/contexts/WorkspaceContext";

export default function ChatPage() {
    const { chats, loading, selectChat, currentChat } = useChat();
    const {
        loadingAgents,
        isAuthDisabled,
        bootstrapIssue,
        agentOptionsIssue,
        refreshBootstrap,
    } = useAgent();
    const { modelsIssue, refreshModels } = useSettings();
    const { isWorkspaceReady } = useWorkspace();
    const isConvexAvailable = useIsConvexAvailable();
    const { isAuthenticated, isLoading: isAuthLoading } = useConvexAuth();
    const { signIn } = useAuthActions() ?? {};
    const [initialized, setInitialized] = useState(false);
    const hasAccess =
        isConvexAvailable &&
        (isAuthDisabled ? isWorkspaceReady : isAuthenticated);

    // Select a chat on first load for the active agent.
    useEffect(() => {
        if (!hasAccess) return;
        if (loadingAgents) return;
        if (!initialized && !loading) {
            requestAnimationFrame(() => {
                setInitialized(true);
                if (!currentChat) {
                    if (chats.length > 0) {
                        void selectChat(chats[0].id);
                    }
                }
            });
        }
    }, [
        initialized,
        currentChat,
        loadingAgents,
        loading,
        chats,
        hasAccess,
        selectChat,
    ]);

    // If data loads later, select the latest chat when empty.
    useEffect(() => {
        if (!hasAccess) return;
        if (loadingAgents) return;
        if (loading || !initialized) return;
        if (currentChat || chats.length === 0) return;
        void selectChat(chats[0].id);
    }, [
        chats,
        currentChat,
        initialized,
        hasAccess,
        loading,
        loadingAgents,
        selectChat,
    ]);

    if (
        isAuthLoading ||
        loadingAgents ||
        (isAuthDisabled && !isWorkspaceReady)
    ) {
        return (
            <div className="flex h-dvh items-center justify-center bg-background">
                <Loader2 size={24} className="animate-spin text-primary" />
            </div>
        );
    }

    if (bootstrapIssue) {
        return (
            <div className="flex h-dvh items-center justify-center bg-background px-6">
                <div className="w-full max-w-2xl space-y-4">
                    <OperatorNotice
                        issue={bootstrapIssue}
                        actionLabel="Retry bootstrap"
                        onAction={() => void refreshBootstrap()}
                    />
                    <p className="text-sm text-muted-foreground">
                        Fix the local Agentchat server configuration first. The
                        web app cannot discover agents or providers until the
                        bootstrap request succeeds.
                    </p>
                </div>
            </div>
        );
    }

    if (!isConvexAvailable || !hasAccess) {
        return (
            <div className="flex h-dvh items-center justify-center bg-background px-6">
                <div className="w-full max-w-md border border-border bg-background-elevated p-8 text-center">
                    <h1 className="text-xl font-semibold">
                        {isAuthDisabled
                            ? "Workspace unavailable"
                            : "Sign in required"}
                    </h1>
                    <p className="mt-3 text-sm text-muted-foreground">
                        {isAuthDisabled
                            ? "This instance has authentication disabled, but the default workspace user could not be initialized."
                            : "Agentchat runs against your Convex workspace only. Sign in to access chats and the agents exposed by this instance."}
                    </p>
                    {isAuthDisabled ? null : (
                        <button
                            type="button"
                            className="btn-deco btn-deco-primary mt-6 w-full"
                            onClick={() =>
                                signIn?.("google", { redirectTo: "/chat" })
                            }
                        >
                            Sign in with Google
                        </button>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="relative h-dvh">
            {(agentOptionsIssue || modelsIssue) && (
                <div className="pointer-events-none absolute inset-x-0 top-4 z-20 mx-auto w-full max-w-3xl px-4">
                    <div className="pointer-events-auto space-y-3">
                        {agentOptionsIssue ? (
                            <OperatorNotice
                                issue={agentOptionsIssue}
                                actionLabel="Reload agents"
                                onAction={() => void refreshBootstrap()}
                                tone="warning"
                            />
                        ) : null}
                        {modelsIssue ? (
                            <OperatorNotice
                                issue={modelsIssue}
                                actionLabel="Reload models"
                                onAction={() => void refreshModels()}
                                tone="warning"
                            />
                        ) : null}
                    </div>
                </div>
            )}
            <ChatLayout />
        </div>
    );
}
