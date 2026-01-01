"use client";

import React, { useEffect } from "react";
import { Sidebar } from "@/components/chat/Sidebar";
import { ChatWindow } from "@/components/chat/ChatWindow";
import { useChat } from "@/contexts/ChatContext";
import { useSettings } from "@/contexts/SettingsContext";
import { useUser } from "@clerk/nextjs";

export default function ChatPage() {
  const { user, isLoaded } = useUser();
  const { chats, loading, createChat, selectChat, currentChat } = useChat();
  const { apiKey } = useSettings();

  // Create or select a chat on first load
  useEffect(() => {
    if (isLoaded && user && !currentChat && !loading) {
      if (chats.length > 0) {
        // Select the latest chat
        selectChat(chats[0].id);
      } else {
        // Create a new chat if none exist
        createChat();
      }
    }
  }, [isLoaded, user, currentChat, loading, chats, createChat, selectChat]);

  // Redirect if not authenticated
  useEffect(() => {
    if (isLoaded && !user) {
      window.location.href = "/sign-in";
    }
  }, [isLoaded, user]);

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p>Loading...</p>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="flex h-screen">
      <Sidebar />
      <ChatWindow />
    </div>
  );
}
