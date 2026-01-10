"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useChat } from "@/contexts/ChatContext";
import { useSettings } from "@/contexts/SettingsContext";
import { formatDistanceToNow } from "date-fns";
import {
    Plus,
    Trash2,
    MessageSquare,
    Settings,
    Hexagon,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export function Sidebar() {
    const router = useRouter();
    const { chats, loading, createChat, deleteChat, selectChat, currentChat } =
        useChat();
    const { apiKey } = useSettings();

    const isMac =
        typeof navigator !== "undefined" &&
        navigator.platform.toUpperCase().indexOf("MAC") >= 0;

    const handleNewChat = async () => {
        await createChat();
    };

    return (
        <aside className="w-72 h-screen bg-background-elevated border-r border-border flex flex-col relative overflow-hidden">
            {/* Decorative geometric accent */}
            <div className="absolute left-0 top-0 bottom-0 w-px bg-gradient-to-b from-primary via-primary/20 to-transparent" />
            <div className="absolute top-0 left-0 w-16 h-16 opacity-10">
                <div className="absolute inset-0 border-l-2 border-t-2 border-primary" />
            </div>

            {/* Header */}
            <div className="p-5 border-b border-border relative">
                <div className="flex items-center gap-3 mb-4">
                    <div className="relative">
                        <Hexagon
                            size={32}
                            className="text-primary"
                            strokeWidth={1.5}
                        />
                        <span className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-primary">
                            R
                        </span>
                    </div>
                    <div>
                        <h1 className="font-semibold text-lg tracking-tight text-foreground">
                            RouterChat
                        </h1>
                        <p className="text-xs text-foreground-muted tracking-wider uppercase">
                            AI Interface
                        </p>
                    </div>
                </div>
                <button
                    onClick={handleNewChat}
                    className="w-full btn-deco btn-deco-primary group"
                    title={isMac ? "Cmd+Shift+O" : "Ctrl+Shift+O"}
                >
                    <Plus
                        size={16}
                        className="group-hover:rotate-90 transition-transform duration-300"
                    />
                    <span className="text-sm font-medium tracking-wide">
                        New Conversation
                    </span>
                </button>
            </div>

            {/* Chat list */}
            <div className="flex-1 overflow-y-auto">
                {loading ? (
                    <div className="p-6 text-center">
                        <div className="inline-flex gap-1.5">
                            <span className="w-2 h-2 bg-primary rounded-full animate-pulse-soft" />
                            <span
                                className="w-2 h-2 bg-primary rounded-full animate-pulse-soft"
                                style={{ animationDelay: "0.2s" }}
                            />
                            <span
                                className="w-2 h-2 bg-primary rounded-full animate-pulse-soft"
                                style={{ animationDelay: "0.4s" }}
                            />
                        </div>
                        <p className="mt-3 text-sm text-foreground-muted">
                            Loading conversations...
                        </p>
                    </div>
                ) : chats.length === 0 ? (
                    <div className="p-6 text-center">
                        <div className="w-12 h-12 mx-auto mb-3 border border-border-accent rounded-full flex items-center justify-center">
                            <MessageSquare
                                size={20}
                                className="text-primary opacity-60"
                            />
                        </div>
                        <p className="text-sm text-foreground-muted">
                            No conversations yet
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                            Start a new conversation above
                        </p>
                    </div>
                ) : (
                    <ul className="p-3 space-y-1 list-none">
                        {chats.map((chat) => (
                            <li key={chat.id}>
                                <div
                                    onClick={() => {
                                        selectChat(chat.id);
                                        router.push("/chat");
                                    }}
                                    role="button"
                                    tabIndex={0}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                            selectChat(chat.id);
                                            router.push("/chat");
                                        }
                                    }}
                                    className={cn(
                                        "w-full text-left p-3 flex items-start justify-between gap-2 cursor-pointer transition-all duration-200 group relative",
                                        currentChat?.id === chat.id
                                            ? "bg-primary/10 border-l-2 border-primary"
                                            : "hover:bg-muted/50 border-l-2 border-transparent hover:border-primary/30",
                                    )}
                                >
                                    <div className="flex items-start gap-3 min-w-0">
                                        <MessageSquare
                                            size={14}
                                            className={cn(
                                                "mt-1 flex-shrink-0 transition-colors",
                                                currentChat?.id === chat.id
                                                    ? "text-primary"
                                                    : "text-muted-foreground group-hover:text-primary",
                                            )}
                                        />
                                        <div className="min-w-0">
                                            <p className="font-medium truncate text-sm text-foreground">
                                                {chat.title}
                                            </p>
                                            <p className="mono text-xs text-muted-foreground mt-0.5">
                                                {formatDistanceToNow(
                                                    chat.updatedAt,
                                                    { addSuffix: true },
                                                )}
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            deleteChat(chat.id);
                                        }}
                                        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-error p-1 transition-all duration-200"
                                        title="Delete conversation"
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
            <div className="p-4 bg-muted/30 relative">
                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
                <Link
                    href="/settings"
                    className="flex items-center gap-3 text-sm p-3 border border-border hover:border-primary/30 hover:bg-muted/50 transition-all duration-200 group"
                >
                    <Settings
                        size={16}
                        className="text-muted-foreground group-hover:text-primary transition-colors"
                    />
                    <span className="text-foreground-muted group-hover:text-foreground transition-colors">
                        Settings
                    </span>
                </Link>
                {!apiKey && (
                    <div className="mt-3 p-3 bg-warning/5 border border-warning/20">
                        <p className="text-warning text-xs font-medium">
                            API Key Required
                        </p>
                        <p className="text-warning/70 text-xs mt-0.5">
                            Add your OpenRouter API key in Settings
                        </p>
                    </div>
                )}
            </div>

            {/* Bottom decorative corner */}
            <div className="absolute bottom-0 right-0 w-12 h-12 opacity-10">
                <div className="absolute inset-0 border-r-2 border-b-2 border-primary" />
            </div>
        </aside>
    );
}
