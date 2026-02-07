"use client";

import { useEffect } from "react";
import { AlertCircle } from "lucide-react";

interface StorageErrorModalProps {
    title?: string;
    message: string | null; // null = hidden
    onDismiss: () => void;
}

export function StorageErrorModal({
    title,
    message,
    onDismiss,
}: StorageErrorModalProps) {
    useEffect(() => {
        if (!message) return;

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                onDismiss();
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [message, onDismiss]);

    if (!message) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            data-keybinding-scope="modal"
            data-keybinding-open="true"
        >
            <div
                className="absolute inset-0 bg-black/50"
                onClick={onDismiss}
                aria-hidden="true"
            />
            <div
                role="alertdialog"
                aria-modal="true"
                className="relative z-10 w-full max-w-sm bg-background-elevated border border-border shadow-xl p-6"
            >
                <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 p-2 bg-destructive/10 text-destructive">
                        <AlertCircle size={20} />
                    </div>
                    <div className="flex-1">
                        <h2 className="text-lg font-semibold text-foreground">
                            {title ?? "Storage Error"}
                        </h2>
                        <p className="text-sm text-muted-foreground mt-2">
                            {message}
                        </p>
                    </div>
                </div>
                <div className="mt-5 flex justify-end">
                    <button
                        type="button"
                        onClick={onDismiss}
                        className="btn-deco btn-deco-primary cursor-pointer"
                    >
                        <span className="text-sm font-medium">OK</span>
                    </button>
                </div>
            </div>
        </div>
    );
}
