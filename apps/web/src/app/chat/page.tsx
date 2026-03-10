"use client";

import React, { useEffect, useState } from "react";
import { ChatLayout } from "@/components/chat/ChatLayout";
import { useChat } from "@/contexts/ChatContext";
import { useSubscription } from "@/hooks/useSubscription";
import { useAuthActions } from "@convex-dev/auth/react";
import { Loader2 } from "lucide-react";

export default function ChatPage() {
    const { chats, loading, createChat, selectChat, currentChat } = useChat();
    const { isAuthenticated, isLoading: isAuthLoading } = useSubscription();
    const { signIn } = useAuthActions() ?? {};
    const [initialized, setInitialized] = useState(false);

    // Create or select a chat on first load
    useEffect(() => {
        if (!isAuthenticated) return;
        if (!initialized && !loading) {
            requestAnimationFrame(() => {
                setInitialized(true);
                if (!currentChat) {
                    if (chats.length > 0) {
                        selectChat(chats[0].id);
                    } else {
                        createChat();
                    }
                }
            });
        }
    }, [
        initialized,
        currentChat,
        loading,
        chats,
        createChat,
        isAuthenticated,
        selectChat,
    ]);

    // If data loads later, select the latest chat when empty.
    useEffect(() => {
        if (!isAuthenticated) return;
        if (loading || !initialized) return;
        if (currentChat || chats.length === 0) return;
        selectChat(chats[0].id);
    }, [chats, currentChat, initialized, isAuthenticated, loading, selectChat]);

    if (isAuthLoading) {
        return (
            <div className="flex h-dvh items-center justify-center bg-background">
                <Loader2 size={24} className="animate-spin text-primary" />
            </div>
        );
    }

    if (!isAuthenticated) {
        return (
            <div className="flex h-dvh items-center justify-center bg-background px-6">
                <div className="w-full max-w-md border border-border bg-background-elevated p-8 text-center">
                    <h1 className="text-xl font-semibold">Sign in required</h1>
                    <p className="mt-3 text-sm text-muted-foreground">
                        Agentchat now runs against your Convex backend only.
                        Sign in to access chats, skills, and your encrypted API
                        key.
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
