"use client";

import React from "react";

export function LoadingScreen({ message }: { message?: string }) {
    return (
        <div className="min-h-screen flex items-center justify-center bg-background">
            <div className="text-center space-y-4">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10">
                    <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
                <p className="text-lg font-medium">{message ?? "Loading..."}</p>
            </div>
        </div>
    );
}
