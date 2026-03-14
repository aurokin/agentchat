import React, {
    createContext,
    useContext,
    useCallback,
    useMemo,
    type ReactNode,
} from "react";
import * as WebBrowser from "expo-web-browser";
import { makeRedirectUri } from "expo-auth-session";
import { useAction, useConvexAuth, useQuery } from "convex/react";
import { useMutation } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "@convex/_generated/api";
import {
    isConvexConfigured,
    setConvexUrl,
    clearConvexUrl,
} from "@/lib/convex/config";
import { clearAllCredentials } from "@/lib/storage";
import { useIsConvexAvailable } from "@/lib/convex/ConvexProvider";
import { useAgent } from "@/contexts/AgentContext";
import type { ConvexId } from "@/lib/workspace/convex-types";

interface User {
    id: string;
    name?: string;
    email?: string;
    image?: string;
}

interface AuthContextValue {
    user: User | null;
    userId: string | null;
    authMode: "google" | "disabled";
    isAuthDisabled: boolean;
    isAuthenticated: boolean;
    isLoading: boolean;
    isConvexAvailable: boolean;
    signIn: () => Promise<void>;
    signOut: () => Promise<void>;
    getBackendSessionToken: () => Promise<string>;
    configureConvex: (url: string) => Promise<void>;
    clearConvexOverride: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuthContext(): AuthContextValue {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error("useAuthContext must be used within AuthProvider");
    }
    return context;
}

interface AuthProviderProps {
    children: ReactNode;
}

export function AuthProvider({
    children,
}: AuthProviderProps): React.ReactElement {
    const isConvexAvailable = useIsConvexAvailable();
    const { authMode, isAuthDisabled, loadingAgents } = useAgent();
    const { isAuthenticated: isConvexAuthenticated, isLoading: isAuthLoading } =
        useConvexAuth();
    const authActions = useAuthActions();
    const issueBackendSessionToken = useAction(api.backendTokens.issue);
    const ensureAccessUser = useMutation(api.users.ensureAccessUser);
    const [defaultUserId, setDefaultUserId] =
        React.useState<ConvexId<"users"> | null>(null);
    const userId = useQuery(
        api.users.getCurrentUserId,
        isConvexAvailable &&
            !loadingAgents &&
            (isAuthDisabled || isConvexAuthenticated)
            ? {}
            : "skip",
    ) as ConvexId<"users"> | null | undefined;
    const effectiveUserId =
        (isAuthDisabled ? (defaultUserId ?? userId) : userId) ?? null;
    const user = useQuery(
        api.users.get,
        effectiveUserId ? { id: effectiveUserId } : "skip",
    );

    React.useEffect(() => {
        let cancelled = false;

        if (!isConvexAvailable || loadingAgents || !isAuthDisabled) {
            return;
        }

        void ensureAccessUser({})
            .then((nextUserId) => {
                if (cancelled) return;
                setDefaultUserId(nextUserId as ConvexId<"users">);
            })
            .catch((error) => {
                if (cancelled) return;
                console.error(
                    "Failed to initialize default access user:",
                    error,
                );
                setDefaultUserId(null);
            });

        return () => {
            cancelled = true;
        };
    }, [ensureAccessUser, isAuthDisabled, isConvexAvailable, loadingAgents]);

    const isAuthenticated = isAuthDisabled
        ? Boolean(isConvexAvailable && effectiveUserId)
        : isConvexAuthenticated;

    const isUserLoading =
        isAuthenticated &&
        (effectiveUserId === undefined || user === undefined);
    const isLoading = isAuthLoading || isUserLoading;

    const userValue = useMemo<User | null>(() => {
        if (!user || !effectiveUserId) return null;
        return {
            id: (user as any)._id ?? effectiveUserId,
            name: (user as any).name ?? undefined,
            email: (user as any).email ?? undefined,
            image: (user as any).image ?? undefined,
        };
    }, [effectiveUserId, user]);

    const signIn = useCallback(async () => {
        if (isAuthDisabled) {
            return;
        }
        if (!authActions?.signIn) {
            throw new Error("Convex auth is not configured");
        }
        if (!isConvexAvailable || !isConvexConfigured()) {
            throw new Error("Convex is not configured");
        }

        const redirectUri = makeRedirectUri({
            scheme: "agentchat",
            path: "convex-auth",
        });
        const retryDelaysMs = [500, 1000, 2000, 4000, 8000];
        const isRetryableAuthError = (message: string) => {
            const normalized = message.toLowerCase();
            return (
                normalized.includes(
                    "connection lost while action was in flight",
                ) ||
                normalized.includes("stream end encountered") ||
                normalized.includes("websocket") ||
                normalized.includes("connection lost")
            );
        };
        const runWithRetry = async <T,>(operation: () => Promise<T>) => {
            for (
                let attempt = 0;
                attempt <= retryDelaysMs.length;
                attempt += 1
            ) {
                try {
                    return await operation();
                } catch (error) {
                    const message =
                        error instanceof Error ? error.message : String(error);
                    if (!isRetryableAuthError(message)) {
                        throw error;
                    }
                    const delayMs = retryDelaysMs[attempt];
                    if (delayMs === undefined) {
                        throw error;
                    }
                    await new Promise((resolve) =>
                        setTimeout(resolve, delayMs),
                    );
                }
            }
            throw new Error("Sign in failed");
        };

        const result = await runWithRetry(() =>
            authActions.signIn("google", {
                redirectTo: redirectUri,
                calledBy: "mobile",
            } as any),
        );

        if (!result?.redirect) {
            throw new Error("Sign in could not be started.");
        }

        const authSession = await WebBrowser.openAuthSessionAsync(
            result.redirect.toString(),
            redirectUri,
        );

        if (authSession.type !== "success" || !authSession.url) {
            throw new Error("Sign in was cancelled or failed");
        }

        const url = new URL(authSession.url);
        const code = url.searchParams.get("code");
        if (!code) {
            throw new Error("Missing auth code");
        }

        await runWithRetry(() =>
            authActions.signIn(undefined as any, { code } as any),
        );
    }, [authActions, isAuthDisabled, isConvexAvailable]);

    const signOut = useCallback(async () => {
        if (isAuthDisabled) {
            return;
        }
        try {
            await authActions?.signOut?.();
        } finally {
            await clearAllCredentials();
        }
    }, [authActions, isAuthDisabled]);

    const getBackendSessionToken = useCallback(async () => {
        if (!isConvexAvailable || !isAuthenticated) {
            throw new Error(
                isAuthDisabled
                    ? "The default workspace user is not ready yet."
                    : "You must be signed in to connect to Agentchat.",
            );
        }

        const result = await issueBackendSessionToken({});
        if (!result || typeof result.token !== "string") {
            throw new Error(
                "Unable to create an authenticated Agentchat server session.",
            );
        }

        return result.token;
    }, [
        isAuthDisabled,
        isAuthenticated,
        isConvexAvailable,
        issueBackendSessionToken,
    ]);

    const configureConvex = useCallback(async (url: string) => {
        await setConvexUrl(url);
    }, []);

    const clearConvexOverride = useCallback(async () => {
        await clearConvexUrl();
    }, []);

    return (
        <AuthContext.Provider
            value={{
                user: userValue,
                userId: effectiveUserId,
                authMode,
                isAuthDisabled,
                isAuthenticated,
                isLoading,
                isConvexAvailable,
                signIn,
                signOut,
                getBackendSessionToken,
                configureConvex,
                clearConvexOverride,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}

WebBrowser.maybeCompleteAuthSession();
