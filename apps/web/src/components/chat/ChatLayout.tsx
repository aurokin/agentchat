"use client";

import React, { useState, useCallback } from "react";
import { useChat } from "@/contexts/ChatContext";
import { Sidebar } from "./Sidebar";
import { ChatWindow } from "./ChatWindow";
import { MobileNav } from "./MobileNav";
import { useIsMobile } from "@/hooks/useMediaQuery";

export function ChatLayout() {
    const [sidebarOpen, setSidebarOpen] = useState(() => true);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const { createChat } = useChat();
    const isMobile = useIsMobile();

    const handleNewChat = useCallback(async () => {
        await createChat();
        setMobileMenuOpen(false);
    }, [createChat]);

    const handleSidebarToggle = useCallback(() => {
        if (isMobile) {
            setMobileMenuOpen(true);
        }
    }, [isMobile]);

    return (
        <div className="flex h-dvh w-full overflow-hidden bg-background max-w-full">
            {isMobile && (
                <MobileNav
                    isOpen={mobileMenuOpen}
                    onToggle={() => setMobileMenuOpen(!mobileMenuOpen)}
                    onNewChat={handleNewChat}
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
                    isOpen={sidebarOpen}
                    onClose={() => setSidebarOpen(false)}
                />
                <ChatWindow />
            </div>
        </div>
    );
}
