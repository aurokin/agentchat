"use client";

import React from "react";
import { Menu, X, Plus } from "lucide-react";

interface MobileNavProps {
    isOpen: boolean;
    onToggle: () => void;
    onNewChat: () => void;
}

export function MobileNav({ isOpen, onToggle, onNewChat }: MobileNavProps) {
    return (
        <nav
            aria-label="Main navigation"
            className="mobile-nav fixed top-0 left-0 right-0 z-50 flex items-center gap-3 px-4 py-3 bg-background/95 backdrop-blur-sm border-b border-border lg:hidden"
        >
            <button
                type="button"
                className="hamburger-menu flex items-center justify-center w-10 h-10 touch-feedback"
                onClick={onToggle}
                aria-expanded={isOpen}
                aria-controls="mobile-menu"
                aria-label={isOpen ? "Close menu" : "Open menu"}
            >
                {isOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
            {isOpen && (
                <div
                    id="mobile-menu"
                    role="menu"
                    className="mobile-menu absolute top-full left-0 right-0 mt-2 mx-4 p-4 bg-background-elevated border border-border shadow-xl rounded-lg"
                >
                    <button
                        type="button"
                        role="menuitem"
                        onClick={onNewChat}
                        className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-foreground hover:bg-muted rounded-md transition-colors"
                    >
                        <Plus size={18} />
                        New Chat
                    </button>
                </div>
            )}
        </nav>
    );
}
