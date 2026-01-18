"use client";

import { useEffect } from "react";
import { Keyboard, X } from "lucide-react";
import { KeybindingsContent } from "./KeybindingsContent";

interface KeybindingsModalProps {
    open: boolean;
    onClose: () => void;
}

export function KeybindingsModal({ open, onClose }: KeybindingsModalProps) {
    useEffect(() => {
        if (!open) return;

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                onClose();
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [open, onClose]);

    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            data-keybinding-scope="modal"
            data-keybinding-open="true"
        >
            <div
                className="absolute inset-0 bg-black/50"
                onClick={onClose}
                aria-hidden="true"
            />
            <div
                role="dialog"
                aria-modal="true"
                className="relative z-10 w-full max-w-2xl bg-background-elevated border border-border shadow-xl p-6 max-h-[80vh] overflow-y-auto"
            >
                <div className="flex items-center justify-between gap-4 mb-4">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-accent/10 flex items-center justify-center">
                            <Keyboard size={18} className="text-accent" />
                        </div>
                        <h2 className="text-lg font-medium">Keybindings</h2>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors cursor-pointer"
                        aria-label="Close keybindings"
                    >
                        <X size={18} />
                    </button>
                </div>
                <KeybindingsContent />
            </div>
        </div>
    );
}
