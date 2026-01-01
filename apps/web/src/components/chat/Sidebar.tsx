"use client";

import React from "react";
import { useChat } from "@/contexts/ChatContext";
import { useSettings } from "@/contexts/SettingsContext";
import { formatDistanceToNow } from "date-fns";
import { Plus, Trash2, MessageSquare, Settings, LogOut } from "lucide-react";
import { UserButton, useUser, useAuth } from "@clerk/nextjs";
import Link from "next/link";

export function Sidebar() {
  const { chats, loading, createChat, deleteChat, selectChat, currentChat } = useChat();
  const { setApiKey, apiKey } = useSettings();
  const { user } = useUser();
  const { signOut } = useAuth();

  const handleNewChat = async () => {
    await createChat();
  };

  return (
    <aside className="w-64 h-screen bg-gray-100 border-r border-gray-200 flex flex-col">
      <div className="p-4 border-b border-gray-200">
        <button
          onClick={handleNewChat}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus size={18} />
          New Chat
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 text-center text-gray-500">Loading chats...</div>
        ) : chats.length === 0 ? (
          <div className="p-4 text-center text-gray-500">
            No chats yet. Start a new conversation!
          </div>
        ) : (
          <ul className="p-2">
            {chats.map((chat) => (
              <li key={chat.id}>
                <button
                  onClick={() => selectChat(chat.id)}
                  className={`w-full text-left p-3 rounded-lg flex items-start justify-between gap-2 hover:bg-gray-200 transition-colors ${
                    currentChat?.id === chat.id ? "bg-blue-100" : ""
                  }`}
                >
                  <div className="flex items-start gap-2 min-w-0">
                    <MessageSquare size={16} className="mt-1 flex-shrink-0 text-gray-500" />
                    <div className="min-w-0">
                      <p className="font-medium truncate">{chat.title}</p>
                      <p className="text-xs text-gray-500">
                        {formatDistanceToNow(chat.updatedAt, { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteChat(chat.id);
                    }}
                    className="text-gray-400 hover:text-red-500 p-1"
                  >
                    <Trash2 size={14} />
                  </button>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="p-4 border-t border-gray-200">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <UserButton />
            <span className="text-sm font-medium truncate max-w-24">
              {user?.firstName || "User"}
            </span>
          </div>
          <button
            onClick={() => signOut()}
            className="text-gray-500 hover:text-gray-700"
            title="Sign out"
          >
            <LogOut size={16} />
          </button>
        </div>

        <div className="space-y-2">
          <Link
            href="/settings"
            className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 p-2 rounded hover:bg-gray-200"
          >
            <Settings size={16} />
            Settings
          </Link>
          {!apiKey && (
            <p className="text-xs text-amber-600 bg-amber-50 p-2 rounded">
              Please add your OpenRouter API key in Settings
            </p>
          )}
        </div>
      </div>
    </aside>
  );
}
