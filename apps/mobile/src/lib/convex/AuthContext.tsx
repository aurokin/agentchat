import React, {
    createContext,
    useContext,
    useState,
    useEffect,
    useCallback,
    type ReactNode,
} from "react";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import { makeRedirectUri, useAuthRequest } from "expo-auth-session";
import * as Google from "expo-auth-session/providers/google";
import { ConvexReactClient } from "convex/react";
import { getConvexClient, clearConvexClient } from "./client";
import { isConvexConfigured } from "./config";
import { clearAllCredentials } from "../storage";

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
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isConvexAvailable, setIsConvexAvailable] = useState(false);

    const redirectUri = makeRedirectUri({
        scheme: "routerchat",
        path: "convex-auth",
    });

    const [request, response, promptAsync] = Google.useAuthRequest({
        clientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || "",
        redirectUri,
        scopes: ["openid", "profile", "email"],
    });

    const checkConvexAvailability = useCallback(() => {
        const available = isConvexConfigured();
        setIsConvexAvailable(available);
    }, []);

    const signIn = useCallback(async () => {
        try {
            const result = await promptAsync();
            if (result.type !== "success") {
                throw new Error("Sign in was cancelled or failed");
            }
        } catch (error) {
            console.error("Failed to start Google sign-in:", error);
            throw error;
        }
    }, [promptAsync]);

    const signOut = useCallback(async () => {
        try {
            setUser(null);
            clearConvexClient();
            setIsConvexAvailable(false);
            await clearAllCredentials();
        } catch (error) {
            console.error("Failed to sign out:", error);
        }
    }, []);

    const configureConvex = useCallback(
        async (url: string) => {
            await SecureStore.setItem("routerchat-convex-url", url);
            checkConvexAvailability();
        },
        [checkConvexAvailability],
    );

    useEffect(() => {
        checkConvexAvailability();
        setIsLoading(false);
    }, [checkConvexAvailability]);

    useEffect(() => {
        const handleGoogleResponse = async () => {
            if (response?.type === "success" && response.authentication) {
                const accessToken = response.authentication.accessToken;

                const convex = getConvexClient();
                if (convex) {
                    try {
                        const userInfo = await (convex.query as any)(
                            "auth:user",
                            {
                                token: accessToken,
                            },
                        );
                        if (userInfo) {
                            setUser(userInfo as User);
                        }
                    } catch (error) {
                        console.error("Failed to get user info:", error);
                    }
                }
            }
        };

        handleGoogleResponse();
    }, [response]);

    return (
        <AuthContext.Provider
            value={{
                user,
                isAuthenticated: user !== null,
                isLoading,
                isConvexAvailable,
                signIn,
                signOut,
                configureConvex,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}

WebBrowser.maybeCompleteAuthSession();
