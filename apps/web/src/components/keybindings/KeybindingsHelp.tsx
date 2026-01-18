"use client";

import { useState } from "react";
import { Keyboard } from "lucide-react";
import { KEYBINDING_HIGHLIGHTS, KeyCaps } from "./KeybindingsContent";
import { KeybindingsModal } from "./KeybindingsModal";

export function KeybindingsHelp() {
    const [isModalOpen, setIsModalOpen] = useState(false);

    return (
        <>
            <div className="relative group/keybindings">
                <button
                    type="button"
                    onClick={() => setIsModalOpen(true)}
                    className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors cursor-pointer"
                    aria-label="Keybindings"
                >
                    <Keyboard size={16} />
                </button>
                <div className="absolute bottom-full right-0 mb-2 px-3 py-2 bg-background-elevated border border-border text-xs text-foreground whitespace-nowrap opacity-0 group-hover/keybindings:opacity-100 group-focus-within/keybindings:opacity-100 transition-opacity pointer-events-none z-20">
                    <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                        Keybindings
                    </div>
                    <div className="mt-2 space-y-1">
                        {KEYBINDING_HIGHLIGHTS.map((binding) => (
                            <div
                                key={binding.id}
                                className="flex items-center justify-between gap-3"
                            >
                                <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                                    {binding.icon && (
                                        <binding.icon
                                            size={10}
                                            className="text-muted-foreground"
                                        />
                                    )}
                                    {binding.label}
                                </span>
                                <div className="flex items-center gap-1">
                                    {binding.keys.map((key) => (
                                        <KeyCaps key={`${binding.id}-${key}`}>
                                            {key}
                                        </KeyCaps>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="mt-2 text-[11px] text-muted-foreground/80">
                        Click for full list
                    </div>
                    <span className="absolute top-full right-4 border-4 border-transparent border-t-border" />
                </div>
            </div>
            <KeybindingsModal
                open={isModalOpen}
                onClose={() => setIsModalOpen(false)}
            />
        </>
    );
}
