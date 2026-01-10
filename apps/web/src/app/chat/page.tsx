"use client";

import React, { useEffect, useState } from "react";
import { ChatLayout } from "@/components/chat/ChatLayout";
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
                e.stopPropagation();
                createChat();
            }
        };

        window.addEventListener("keydown", handleKeyDown, true);
        return () => window.removeEventListener("keydown", handleKeyDown, true);
    }, [createChat]);

    return <ChatLayout />;
}
