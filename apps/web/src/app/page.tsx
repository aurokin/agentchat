"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, Suspense } from "react";

function AuthHandler() {
    const searchParams = useSearchParams();
    const code = searchParams?.get("code");

    useEffect(() => {
        if (!code) {
            window.location.href = "/chat";
        }
    }, [code]);

    if (!code) {
        return null;
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-background">
            <div className="text-center space-y-4">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10">
                    <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
                <p className="text-lg font-medium">Authenticating...</p>
                <p className="text-sm text-muted-foreground">
                    Completing sign in, please wait
                </p>
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
