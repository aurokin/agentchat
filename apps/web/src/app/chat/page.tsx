"use client";

import React, { useEffect, useState } from "react";
import { useConvexAuth } from "convex/react";
import { ChatLayout } from "@/components/chat/ChatLayout";
import { useChat } from "@/contexts/ChatContext";
import { useAgent } from "@/contexts/AgentContext";
import { useAuthActions } from "@convex-dev/auth/react";
import { Loader2 } from "lucide-react";
import { useIsConvexAvailable } from "@/contexts/ConvexProvider";

export default function ChatPage() {
    const { chats, loading, selectChat, currentChat } = useChat();
    const { loadingAgents } = useAgent();
    const isConvexAvailable = useIsConvexAvailable();
    const { isAuthenticated, isLoading: isAuthLoading } = useConvexAuth();
    const { signIn } = useAuthActions() ?? {};
    const [initialized, setInitialized] = useState(false);

    // Select a chat on first load for the active agent.
    useEffect(() => {
        if (!isAuthenticated) return;
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
        isAuthenticated,
        selectChat,
    ]);

    // If data loads later, select the latest chat when empty.
    useEffect(() => {
        if (!isAuthenticated) return;
        if (loadingAgents) return;
        if (loading || !initialized) return;
        if (currentChat || chats.length === 0) return;
        void selectChat(chats[0].id);
    }, [
        chats,
        currentChat,
        initialized,
        isAuthenticated,
        loading,
        loadingAgents,
        selectChat,
    ]);

    if (isAuthLoading || loadingAgents) {
        return (
            <div className="flex h-dvh items-center justify-center bg-background">
                <Loader2 size={24} className="animate-spin text-primary" />
            </div>
        );
    }

    if (!isConvexAvailable || !isAuthenticated) {
        return (
            <div className="flex h-dvh items-center justify-center bg-background px-6">
                <div className="w-full max-w-md border border-border bg-background-elevated p-8 text-center">
                    <h1 className="text-xl font-semibold">Sign in required</h1>
                    <p className="mt-3 text-sm text-muted-foreground">
                        Agentchat runs against your Convex workspace only. Sign
                        in to access chats and the agents exposed by this
                        deployment.
                    </p>
                    <button
                        type="button"
                        className="btn-deco btn-deco-primary mt-6 w-full"
                        onClick={() =>
                            signIn?.("google", { redirectTo: "/chat" })
                        }
                    >
                        Sign in with Google
                    </button>
                </div>
            </div>
        );
    }

    return <ChatLayout />;
}
