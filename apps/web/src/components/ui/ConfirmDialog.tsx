"use client";

import React, { useEffect } from "react";

interface ConfirmDialogProps {
    open: boolean;
    title: string;
    description?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    onConfirm: () => void | Promise<void>;
    onCancel: () => void;
}

export function ConfirmDialog({
    open,
    title,
    description,
    confirmLabel = "Confirm",
    cancelLabel = "Cancel",
    onConfirm,
    onCancel,
}: ConfirmDialogProps) {
    useEffect(() => {
        if (!open) return;

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                onCancel();
            }
            if (event.key === "Enter") {
                event.preventDefault();
                onConfirm();
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [open, onCancel, onConfirm]);

    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            data-keybinding-scope="modal"
            data-keybinding-open="true"
        >
            <div
                className="absolute inset-0 bg-black/50"
                onClick={onCancel}
                aria-hidden="true"
            />
            <div
                role="dialog"
                aria-modal="true"
                className="relative z-10 w-full max-w-sm bg-background-elevated border border-border shadow-xl p-6"
            >
                <h2 className="text-lg font-semibold text-foreground">
                    {title}
                </h2>
                {description && (
                    <p className="text-sm text-muted-foreground mt-2">
                        {description}
                    </p>
                )}
                <div className="mt-5 flex justify-end gap-3">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="btn-deco btn-deco-secondary cursor-pointer"
                    >
                        <span className="text-sm font-medium">
                            {cancelLabel}
                        </span>
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        className="btn-deco btn-deco-primary cursor-pointer"
                    >
                        <span className="text-sm font-medium">
                            {confirmLabel}
                        </span>
                    </button>
                </div>
            </div>
        </div>
    );
}
