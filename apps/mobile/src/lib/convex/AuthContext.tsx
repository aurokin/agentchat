import React, {
    createContext,
    useContext,
    useCallback,
    useMemo,
    type ReactNode,
} from "react";
import * as WebBrowser from "expo-web-browser";
import { makeRedirectUri } from "expo-auth-session";
import { useConvexAuth, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "../../../../web/convex/_generated/api";
import { isConvexConfigured, setConvexUrl, clearConvexUrl } from "./config";
import { clearAllCredentials } from "../storage";
import { useIsConvexAvailable } from "./ConvexProvider";

interface User {
    id: string;
    name?: string;
    email?: string;
    image?: string;
}

interface AuthContextValue {
    user: User | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    isConvexAvailable: boolean;
    signIn: () => Promise<void>;
    signOut: () => Promise<void>;
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
    const { isAuthenticated, isLoading: isAuthLoading } = useConvexAuth();
    const authActions = useAuthActions();
    const userId = useQuery(
        api.users.getCurrentUserId,
        isAuthenticated ? {} : "skip",
    );
    const user = useQuery(api.users.get, userId ? { id: userId } : "skip");

    const isUserLoading =
        isAuthenticated && (userId === undefined || user === undefined);
    const isLoading = isAuthLoading || isUserLoading;

    const userValue = useMemo<User | null>(() => {
        if (!user || !userId) return null;
        return {
            id: (user as any)._id ?? userId,
            name: (user as any).name ?? undefined,
            email: (user as any).email ?? undefined,
            image: (user as any).image ?? undefined,
        };
    }, [user, userId]);

    const signIn = useCallback(async () => {
        if (!authActions?.signIn) {
            throw new Error("Convex auth is not configured");
        }
        if (!isConvexAvailable || !isConvexConfigured()) {
            throw new Error("Convex is not configured");
        }

        const redirectUri = makeRedirectUri({
            scheme: "routerchat",
            path: "convex-auth",
        });

        const result = await authActions.signIn("google", {
            redirectTo: redirectUri,
            calledBy: "mobile",
        } as any);

        if (result?.redirect) {
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

            await authActions.signIn(undefined as any, { code } as any);
        }
    }, [authActions, isConvexAvailable]);

    const signOut = useCallback(async () => {
        try {
            await authActions?.signOut?.();
        } finally {
            await clearAllCredentials();
        }
    }, [authActions]);

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
                isAuthenticated,
                isLoading,
                isConvexAvailable,
                signIn,
                signOut,
                configureConvex,
                clearConvexOverride,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}

WebBrowser.maybeCompleteAuthSession();
