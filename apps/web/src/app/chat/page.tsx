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
import { BackgroundRuntimeSubscriptions } from "@/components/chat/BackgroundRuntimeSubscriptions";

export default function ChatPage() {
    const { chats, loading, selectChat, currentChat } = useChat();
    const {
        loadingAgents,
        authProviderKind,
        authRequiresLogin,
        bootstrapIssue,
        agentOptionsIssue,
        refreshBootstrap,
    } = useAgent();
    const { modelsIssue, refreshModels } = useSettings();
    const isConvexAvailable = useIsConvexAvailable();
    const { isAuthenticated, isLoading: isAuthLoading } = useConvexAuth();
    const { signIn } = useAuthActions() ?? {};
    const [initialized, setInitialized] = useState(false);
    const [localUsername, setLocalUsername] = useState("");
    const [localPassword, setLocalPassword] = useState("");
    const [localSignInError, setLocalSignInError] = useState<string | null>(
        null,
    );
    const [isLocalSigningIn, setIsLocalSigningIn] = useState(false);
    const hasAccess = isConvexAvailable && isAuthenticated;

    const handleLocalSignIn = async () => {
        if (!signIn) {
            setLocalSignInError("Convex auth is not configured.");
            return;
        }

        const username = localUsername.trim();
        if (!username || !localPassword) {
            setLocalSignInError("Username and password are required.");
            return;
        }

        setIsLocalSigningIn(true);
        setLocalSignInError(null);
        try {
            await signIn("password", {
                flow: "signIn",
                username,
                password: localPassword,
                calledBy: "web",
            } as any);
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error);
            setLocalSignInError(
                message || "Could not sign in with the local user.",
            );
        } finally {
            setIsLocalSigningIn(false);
        }
    };

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

    if (isAuthLoading || loadingAgents) {
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
                    <h1 className="text-xl font-semibold">Sign in required</h1>
                    <p className="mt-3 text-sm text-muted-foreground">
                        Agentchat runs against your Convex workspace only. Sign
                        in to access chats and the agents exposed by this
                        instance.
                    </p>
                    {!authRequiresLogin ? null : authProviderKind ===
                      "local" ? (
                        <div className="mt-6 space-y-3 text-left">
                            <input
                                type="text"
                                value={localUsername}
                                onChange={(event) =>
                                    setLocalUsername(event.target.value)
                                }
                                data-testid="local-username-input"
                                autoCapitalize="none"
                                autoCorrect="off"
                                placeholder="Username"
                                className="w-full border border-border bg-background px-3 py-2 text-sm text-foreground outline-none"
                            />
                            <input
                                type="password"
                                value={localPassword}
                                onChange={(event) =>
                                    setLocalPassword(event.target.value)
                                }
                                data-testid="local-password-input"
                                placeholder="Password"
                                className="w-full border border-border bg-background px-3 py-2 text-sm text-foreground outline-none"
                            />
                            {localSignInError ? (
                                <p className="text-sm text-destructive">
                                    {localSignInError}
                                </p>
                            ) : null}
                            <button
                                type="button"
                                className="btn-deco btn-deco-primary w-full"
                                onClick={() => void handleLocalSignIn()}
                                disabled={isLocalSigningIn}
                                data-testid="local-sign-in-button"
                            >
                                {isLocalSigningIn
                                    ? "Signing in..."
                                    : "Sign in with local user"}
                            </button>
                        </div>
                    ) : (
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
            <BackgroundRuntimeSubscriptions />
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
