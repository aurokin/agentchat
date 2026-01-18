"use client";

import React, { useState, useCallback } from "react";
import { Sidebar } from "./Sidebar";
import { ChatWindow } from "./ChatWindow";
import { MobileNav } from "./MobileNav";
import { FirstRunTutorialModal } from "@/components/tutorial/FirstRunTutorialModal";
import { useIsMobile } from "@/hooks/useMediaQuery";

export function ChatLayout() {
    const [sidebarOpen, setSidebarOpen] = useState(() => true);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const isMobile = useIsMobile();

    const handleMobileToggle = useCallback(() => {
        setMobileMenuOpen((open) => !open);
    }, []);

    const handleSidebarClose = useCallback(() => {
        if (isMobile) {
            setMobileMenuOpen(false);
        } else {
            setSidebarOpen(false);
        }
    }, [isMobile]);

    return (
        <div className="flex h-dvh w-full overflow-hidden bg-background max-w-full">
            <FirstRunTutorialModal />
            {isMobile && (
                <MobileNav
                    isOpen={mobileMenuOpen}
                    onToggle={handleMobileToggle}
                />
            )}
            <div
                className={
                    isMobile
                        ? "flex flex-1 pt-14 overflow-hidden"
                        : "flex flex-1 overflow-hidden"
                }
            >
                <Sidebar
                    isOpen={isMobile ? mobileMenuOpen : sidebarOpen}
                    onClose={handleSidebarClose}
                />
                <ChatWindow />
            </div>
        </div>
    );
}
