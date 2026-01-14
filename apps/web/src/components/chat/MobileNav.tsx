"use client";

import React from "react";
import { Menu, X } from "lucide-react";

interface MobileNavProps {
    isOpen: boolean;
    onToggle: () => void;
}

export function MobileNav({ isOpen, onToggle }: MobileNavProps) {
    return (
        <nav
            aria-label="Main navigation"
            className="mobile-nav fixed top-0 left-0 right-0 z-50 flex items-center gap-3 px-4 py-3 bg-background/95 backdrop-blur-sm border-b border-border lg:hidden"
        >
            <button
                type="button"
                className="hamburger-menu flex items-center justify-center w-10 h-10 touch-feedback cursor-pointer"
                onClick={onToggle}
                aria-expanded={isOpen}
                aria-label={isOpen ? "Close sidebar" : "Open sidebar"}
            >
                {isOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
            <span className="text-sm font-medium text-foreground">
                Conversations
            </span>
        </nav>
    );
}
