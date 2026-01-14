"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState, Suspense } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useIsConvexAvailable } from "@/contexts/ConvexProvider";

function AuthHandler() {
    const searchParams = useSearchParams();
    const code = searchParams?.get("code");
    const isConvexAvailable = useIsConvexAvailable();
    const currentUserId = useQuery(
        api.users.getCurrentUserId,
        isConvexAvailable ? undefined : "skip",
    );
    const [hasRedirected, setHasRedirected] = useState(false);
    const [isClient, setIsClient] = useState(false);
    const isLoading = currentUserId === undefined;

    useEffect(() => {
        setIsClient(true);
    }, []);

    useEffect(() => {
        if (hasRedirected || !isClient) return;

        if (code && isConvexAvailable) {
            console.log(
                "OAuth callback detected, waiting for auth to complete...",
            );
            if (!isLoading && currentUserId !== null) {
                console.log("Auth complete, redirecting to chat...");
                setHasRedirected(true);
                window.location.href = "/chat";
            }
        } else if (!code && isClient) {
            window.location.href = "/chat";
        }
    }, [
        code,
        isConvexAvailable,
        isLoading,
        currentUserId,
        hasRedirected,
        isClient,
    ]);

    if (!isClient) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <div className="text-center space-y-4">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10">
                        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    </div>
                    <p className="text-lg font-medium">Loading...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-background">
            <div className="text-center space-y-4">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10">
                    <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
                <p className="text-lg font-medium">
                    {code && isConvexAvailable
                        ? "Authenticating..."
                        : "Loading..."}
                </p>
                {code && isConvexAvailable && (
                    <p className="text-sm text-muted-foreground">
                        Completing sign in, please wait
                    </p>
                )}
            </div>
        </div>
    );
}

export default function Home() {
    return (
        <Suspense
            fallback={
                <div className="min-h-screen flex items-center justify-center bg-background">
                    <div className="text-center space-y-4">
                        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10">
                            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                        </div>
                        <p className="text-lg font-medium">Loading...</p>
                    </div>
                </div>
            }
        >
            <AuthHandler />
        </Suspense>
    );
}
