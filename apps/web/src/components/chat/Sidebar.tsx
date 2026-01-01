"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useChat } from "@/contexts/ChatContext";
import { useSettings } from "@/contexts/SettingsContext";
import { formatDistanceToNow } from "date-fns";
import { Plus, Trash2, MessageSquare, Settings, LogOut, Terminal } from "lucide-react";
import { UserButton, useUser, useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { cn } from "@/lib/utils";

export function Sidebar() {
  const router = useRouter();
  const { chats, loading, createChat, deleteChat, selectChat, currentChat } = useChat();
  const { setApiKey, apiKey } = useSettings();
  const { user } = useUser();
  const { signOut } = useAuth();

  const handleNewChat = async () => {
    await createChat();
  };

  return (
    <aside className="w-72 h-screen bg-muted/50 border-r-2 border-border flex flex-col relative">
      {/* Sidebar accent line */}
      <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />

      {/* Header */}
      <div className="p-4 border-b-2 border-border">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 bg-primary flex items-center justify-center shadow-brutal-sm">
            <Terminal size={18} className="text-primary-foreground" />
          </div>
          <span className="font-bold text-lg">OpenRouter</span>
        </div>
        <button
          onClick={handleNewChat}
          className="w-full btn-brutal btn-brutal-primary"
        >
          <Plus size={18} />
          <span className="mono text-sm">NEW_CHAT</span>
        </button>
      </div>

      {/* Chat list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 text-center text-muted-foreground mono text-sm">
            // Loading chats...
          </div>
        ) : chats.length === 0 ? (
          <div className="p-4 text-center text-muted-foreground mono text-sm">
            // No chats yet.<br />Start a conversation!
          </div>
        ) : (
          <ul className="p-2 list-none">
            {chats.map((chat, index) => (
              <li key={chat.id} className="animate-slide-in" style={{ animationDelay: `${index * 50}ms` }}>
                <div
                  onClick={() => {
                    selectChat(chat.id);
                    router.push("/chat");
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      selectChat(chat.id);
                      router.push("/chat");
                    }
                  }}
                  className={cn(
                    "w-full text-left p-3 mb-1 border-2 border-transparent flex items-start justify-between gap-2 cursor-pointer transition-all duration-150 hover:translate-x-1",
                    currentChat?.id === chat.id
                      ? "bg-primary/10 border-primary/30"
                      : "hover:bg-muted hover:border-border"
                  )}
                >
                  <div className="flex items-start gap-2 min-w-0">
                    <MessageSquare size={16} className="mt-1 flex-shrink-0 text-primary" />
                    <div className="min-w-0">
                      <p className="font-medium truncate text-sm">{chat.title}</p>
                      <p className="mono text-xs text-muted-foreground">
                        {formatDistanceToNow(chat.updatedAt, { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteChat(chat.id);
                    }}
                    className="text-muted-foreground hover:text-error p-1 transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t-2 border-border">
        <div className="flex items-center justify-between mb-3 p-2 bg-muted border border-border">
          <div className="flex items-center gap-2">
            <UserButton />
            <span className="font-medium text-sm truncate max-w-28">
              {user?.firstName || "User"}
            </span>
          </div>
          <button
            onClick={() => signOut()}
            className="text-muted-foreground hover:text-error transition-colors p-1"
            title="Sign out"
          >
            <LogOut size={16} />
          </button>
        </div>

        <div className="space-y-2">
          <Link
            href="/settings"
            className="flex items-center gap-2 text-sm p-2 border border-border hover:bg-muted hover:border-primary/50 transition-all duration-150"
          >
            <Settings size={16} />
            <span className="mono text-xs">SETTINGS</span>
          </Link>
          {!apiKey && (
            <div className="p-2 bg-warning/10 border border-warning/30">
              <p className="text-warning mono text-xs">
                // Add your OpenRouter<br />API key in Settings
              </p>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
