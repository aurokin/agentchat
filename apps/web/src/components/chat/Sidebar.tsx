"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useChat } from "@/contexts/ChatContext";
import { useSettings } from "@/contexts/SettingsContext";
import { formatDistanceToNow } from "date-fns";
import { Plus, Trash2, Settings, Hexagon } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { ChatListSkeleton } from "./ChatListSkeleton";
import {
    useIsMobile,
    useIsTablet,
    useTouchDevice,
} from "@/hooks/useMediaQuery";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

interface SidebarProps {
    isOpen?: boolean;
    onClose?: () => void;
}

export function Sidebar({ isOpen: propsIsOpen = true, onClose }: SidebarProps) {
    const router = useRouter();
    const { chats, loading, createChat, deleteChat, selectChat, currentChat } =
        useChat();
    const { apiKey } = useSettings();
    const isMobile = useIsMobile();
    const isTablet = useIsTablet();
    const isTouchDevice = useTouchDevice();

    const [isMac, setIsMac] = useState(false);
    const [pendingDeleteChatId, setPendingDeleteChatId] = useState<
        string | null
    >(null);

    const pendingChat = useMemo(
        () => chats.find((chat) => chat.id === pendingDeleteChatId) ?? null,
        [chats, pendingDeleteChatId],
    );

    const isMobileActionMode = isMobile || isTablet || isTouchDevice;

    useEffect(() => {
        /* eslint-disable react-hooks/set-state-in-effect */
        const macCheck =
            typeof navigator !== "undefined" &&
            navigator.platform.toUpperCase().indexOf("MAC") >= 0;
        setIsMac(macCheck);
        /* eslint-enable react-hooks/set-state-in-effect */
    }, []);

    const handleNewChat = async () => {
        await createChat();
        router.push("/chat");
        if (isMobile) {
            onClose?.();
        }
    };

    const handleSelectChat = (chatId: string) => {
        selectChat(chatId);
        router.push("/chat");
        if (isMobile) {
            onClose?.();
        }
    };

    const requestDeleteChat = (chatId: string) => {
        setPendingDeleteChatId(chatId);
    };

    const handleConfirmDelete = async () => {
        if (!pendingDeleteChatId) return;
        await deleteChat(pendingDeleteChatId);
        setPendingDeleteChatId(null);
    };

    if (!propsIsOpen && isMobile) {
        return null;
    }

    return (
        <>
            {isMobile && propsIsOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-40 lg:hidden"
                    onClick={onClose}
                    aria-hidden="true"
                />
            )}
            <aside
                className={cn(
                    "h-full bg-background-elevated border-r border-border flex flex-col relative overflow-hidden",
                    isMobile &&
                        "fixed left-0 top-0 bottom-0 z-50 w-72 transition-transform duration-300",
                    isMobile && !propsIsOpen && "-translate-x-full",
                )}
                aria-label="Chat sidebar"
                aria-expanded={propsIsOpen}
            >
                <div className="absolute left-0 top-0 bottom-0 w-px bg-gradient-to-b from-primary via-primary/20 to-transparent" />
                <div className="absolute top-0 left-0 w-16 h-16 opacity-10">
                    <div className="absolute inset-0 border-l-2 border-t-2 border-primary" />
                </div>

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
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={handleNewChat}
                        className="w-full btn-deco btn-deco-primary group"
                        title={isMac ? "Cmd+Shift+O" : "Ctrl+Shift+O"}
                        suppressHydrationWarning
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

                <div className="flex-1 overflow-y-auto">
                    {loading ? (
                        <ChatListSkeleton />
                    ) : chats.length === 0 ? (
                        <div className="p-6 text-center">
                            <p className="text-sm text-foreground-muted">
                                No conversations yet
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                                Start a new conversation above
                            </p>
                        </div>
                    ) : (
                        <ul className="p-3 space-y-1 list-none">
                            {chats.map((chat) => {
                                const isActive = currentChat?.id === chat.id;

                                return (
                                    <li key={chat.id}>
                                        <div className="relative overflow-hidden">
                                            <div
                                                onClick={() =>
                                                    handleSelectChat(chat.id)
                                                }
                                                role="button"
                                                tabIndex={0}
                                                onKeyDown={(event) => {
                                                    if (event.key === "Enter") {
                                                        handleSelectChat(
                                                            chat.id,
                                                        );
                                                    }
                                                }}
                                                className={cn(
                                                    "w-full text-left p-3 flex items-start gap-2 cursor-pointer transition-all duration-200 group relative",
                                                    isActive
                                                        ? "bg-primary/10 border-l-2 border-primary"
                                                        : "hover:bg-muted/50 border-l-2 border-transparent hover:border-primary/30",
                                                )}
                                            >
                                                <div
                                                    className={cn(
                                                        "min-w-0 flex-1",
                                                        isMobileActionMode &&
                                                            "pr-8",
                                                    )}
                                                >
                                                    <p className="font-medium truncate text-sm text-foreground">
                                                        {chat.title}
                                                    </p>
                                                    <p className="mono text-xs text-muted-foreground mt-0.5">
                                                        {formatDistanceToNow(
                                                            chat.updatedAt,
                                                            {
                                                                addSuffix: true,
                                                            },
                                                        )}
                                                    </p>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        requestDeleteChat(
                                                            chat.id,
                                                        );
                                                    }}
                                                    className={cn(
                                                        "flex items-center justify-center text-muted-foreground hover:text-error transition-all duration-200",
                                                        isMobileActionMode
                                                            ? "absolute right-0 top-1/2 h-6 w-6 -translate-y-1/2 opacity-100"
                                                            : "ml-auto h-7 w-7 opacity-0 group-hover:opacity-100",
                                                    )}
                                                    title="Delete conversation"
                                                    aria-label="Delete conversation"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>

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

                <div className="absolute bottom-0 right-0 w-12 h-12 opacity-10">
                    <div className="absolute inset-0 border-r-2 border-b-2 border-primary" />
                </div>
            </aside>
            <ConfirmDialog
                open={pendingDeleteChatId !== null}
                title="Delete conversation?"
                description={
                    pendingChat
                        ? `This will permanently delete "${pendingChat.title}".`
                        : "This will permanently delete this conversation."
                }
                confirmLabel="Delete"
                cancelLabel="Cancel"
                onConfirm={handleConfirmDelete}
                onCancel={() => setPendingDeleteChatId(null)}
            />
        </>
    );
}
