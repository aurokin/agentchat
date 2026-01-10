"use client";

import React, { useEffect, useState } from "react";
import { Sidebar } from "@/components/chat/Sidebar";
import { ChatWindow } from "@/components/chat/ChatWindow";
import { useChat } from "@/contexts/ChatContext";

export default function ChatPage() {
    const { chats, loading, createChat, selectChat, currentChat } = useChat();
    const [initialized, setInitialized] = useState(false);

    // Create or select a chat on first load
    useEffect(() => {
        if (!initialized && !loading) {
            requestAnimationFrame(() => {
                setInitialized(true);
                if (!currentChat) {
                    if (chats.length > 0) {
                        selectChat(chats[0].id);
                    } else {
                        createChat();
                    }
                }
            });
        }
    }, [initialized, currentChat, loading, chats, createChat, selectChat]);

    // Ctrl + Shift + O to create new chat
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (
                (e.ctrlKey || e.metaKey) &&
                e.shiftKey &&
                e.key.toLowerCase() === "o"
            ) {
                e.preventDefault();
                createChat();
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [createChat]);

    return (
        <div className="flex h-screen">
            <Sidebar />
            <ChatWindow />
        </div>
    );
}
