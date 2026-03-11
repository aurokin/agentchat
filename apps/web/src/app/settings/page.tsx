"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Sidebar } from "@/components/chat/Sidebar";
import { KeybindingsContent } from "@/components/keybindings/KeybindingsContent";
import { useChat } from "@/contexts/ChatContext";
import { useSync } from "@/contexts/SyncContext";
import { useSettings } from "@/contexts/SettingsContext";
import {
    Settings,
    Key,
    Moon,
    Sun,
    Monitor,
    Check,
    Loader2,
    Trash2,
    Info,
    Hexagon,
    HardDrive,
    Keyboard,
    ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

const isKeybindingBlocked = () => {
    if (typeof document === "undefined") return false;
    return Boolean(
        document.querySelector(
            "[data-keybinding-scope='modal'][data-keybinding-open='true'], [data-keybinding-scope='dropdown'][data-keybinding-open='true']",
        ),
    );
};

const isTypingTarget = (target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return false;
    if (target.isContentEditable) return true;
    const tag = target.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
};

function SettingsPageContent() {
    const router = useRouter();
    const { currentChat, clearCurrentChat } = useChat();
    const {
        cloudQuotaStatus,
        cloudStorageUsage,
        clearCloudImages,
        isConvexAvailable,
        refreshQuotaStatus,
        syncState,
    } = useSync();
    const { theme, setTheme } = useSettings();
    const searchParams = useSearchParams();

    useEffect(() => {
        if (typeof window === "undefined") return;
        const hash = window.location.hash.replace("#", "");
        if (hash) {
            const target = document.getElementById(hash);
            if (target) {
                requestAnimationFrame(() => {
                    target.scrollIntoView({
                        behavior: "smooth",
                        block: "start",
                    });
                });
            }
        }
    }, [searchParams]);

    const [clearingCloudStorage, setClearingCloudStorage] = useState(false);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (isKeybindingBlocked()) return;

            if (isTypingTarget(event.target)) return;

            if (event.shiftKey || event.altKey) return;

            const key = event.key.toLowerCase();
            const hasModifier = event.metaKey || event.ctrlKey;

            if (!hasModifier || key !== "," || event.repeat) return;

            event.preventDefault();
            event.stopPropagation();
            if (!currentChat) {
                clearCurrentChat();
            }
            router.push("/chat");
        };

        window.addEventListener("keydown", handleKeyDown, true);
        return () => window.removeEventListener("keydown", handleKeyDown, true);
    }, [clearCurrentChat, currentChat, router]);

    const handleClearCloudImages = async () => {
        if (
            !confirm(
                "This will remove all images from your Convex-backed conversations. You'll see placeholders where images used to be. This cannot be undone. Continue?",
            )
        ) {
            return;
        }

        setClearingCloudStorage(true);
        try {
            await clearCloudImages();
            await refreshQuotaStatus();
        } catch (error) {
            console.error("Failed to clear cloud attachments:", error);
        } finally {
            setClearingCloudStorage(false);
        }
    };

    // Format bytes to human readable
    const formatBytes = (bytes: number): string => {
        if (bytes === 0) return "0 B";
        const k = 1024;
        const sizes = ["B", "KB", "MB", "GB"];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
    };

    return (
        <div className="flex h-screen">
            <Sidebar />
            <main className="flex-1 overflow-y-auto bg-background relative">
                {/* Decorative background */}
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-gradient-radial from-primary/8 via-primary/3 to-transparent" />
                    <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-gradient-radial from-accent/5 via-transparent to-transparent" />
                </div>

                <div className="max-w-2xl mx-auto p-8 relative z-10">
                    {/* Header */}
                    <div className="mb-10">
                        <div className="flex items-center gap-4 mb-3">
                            <div className="relative">
                                <Hexagon
                                    size={48}
                                    className="text-primary"
                                    strokeWidth={1}
                                />
                                <Settings
                                    size={20}
                                    className="absolute inset-0 m-auto text-primary"
                                />
                            </div>
                            <div>
                                <h1 className="text-3xl font-light tracking-tight">
                                    Settings
                                </h1>
                                <p className="text-muted-foreground text-sm">
                                    Configure your preferences
                                </p>
                            </div>
                        </div>
                        <div className="h-px bg-gradient-to-r from-primary/30 via-primary/10 to-transparent" />
                    </div>

                    <section id="model-provider" className="card-deco mb-6">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-8 h-8 bg-primary/10 flex items-center justify-center">
                                <Key size={16} className="text-primary" />
                            </div>
                            <h2 className="text-lg font-medium">
                                Model Provider
                            </h2>
                        </div>

                        <p className="text-sm text-muted-foreground mb-5 leading-relaxed">
                            Agentchat now uses the deployment&apos;s OpenRouter
                            credential. End users do not add or manage their own
                            keys in the app.
                        </p>

                        <div className="space-y-4">
                            <div className="border border-border bg-muted/20 p-4 space-y-2">
                                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                                    Request Path
                                </div>
                                <p className="text-sm text-muted-foreground leading-relaxed">
                                    Chat requests are sent through Convex and
                                    authenticated with the instance-level
                                    OpenRouter key configured by the operator.
                                </p>
                            </div>
                            <div className="flex items-center gap-2 text-muted-foreground text-sm p-3 bg-muted/30 border border-border">
                                <Check size={14} className="text-success" />
                                <span>
                                    Keep Google sign-in restricted to approved
                                    emails if you want to control who can use
                                    the hosted agents.
                                </span>
                            </div>
                        </div>
                    </section>

                    {/* Theme & Keybindings */}
                    <section className="card-deco mb-6">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-8 h-8 bg-warning/10 flex items-center justify-center">
                                <Sun size={16} className="text-warning" />
                            </div>
                            <h2 className="text-lg font-medium">Theme</h2>
                        </div>

                        <div className="grid grid-cols-3 gap-3">
                            <button
                                onClick={() => setTheme("light")}
                                className={cn(
                                    "p-4 border flex flex-col items-center gap-2 transition-all duration-200 cursor-pointer",
                                    theme === "light"
                                        ? "border-primary bg-primary/10 shadow-deco"
                                        : "border-border hover:border-primary/40 bg-background-elevated",
                                )}
                            >
                                <Sun
                                    size={22}
                                    className={
                                        theme === "light"
                                            ? "text-primary"
                                            : "text-muted-foreground"
                                    }
                                />
                                <span className="text-xs font-medium">
                                    Light
                                </span>
                            </button>

                            <button
                                onClick={() => setTheme("dark")}
                                className={cn(
                                    "p-4 border flex flex-col items-center gap-2 transition-all duration-200 cursor-pointer",
                                    theme === "dark"
                                        ? "border-primary bg-primary/10 shadow-deco"
                                        : "border-border hover:border-primary/40 bg-background-elevated",
                                )}
                            >
                                <Moon
                                    size={22}
                                    className={
                                        theme === "dark"
                                            ? "text-primary"
                                            : "text-muted-foreground"
                                    }
                                />
                                <span className="text-xs font-medium">
                                    Dark
                                </span>
                            </button>

                            <button
                                onClick={() => setTheme("system")}
                                className={cn(
                                    "p-4 border flex flex-col items-center gap-2 transition-all duration-200 cursor-pointer",
                                    theme === "system"
                                        ? "border-primary bg-primary/10 shadow-deco"
                                        : "border-border hover:border-primary/40 bg-background-elevated",
                                )}
                            >
                                <Monitor
                                    size={22}
                                    className={
                                        theme === "system"
                                            ? "text-primary"
                                            : "text-muted-foreground"
                                    }
                                />
                                <span className="text-xs font-medium">
                                    System
                                </span>
                            </button>
                        </div>

                        <div className="mt-6 flex items-center gap-3 mb-4">
                            <div className="w-8 h-8 bg-accent/10 flex items-center justify-center">
                                <Keyboard size={16} className="text-accent" />
                            </div>
                            <h2 className="text-lg font-medium">Keybindings</h2>
                        </div>
                        <details className="group">
                            <summary className="flex items-center justify-between gap-4 cursor-pointer select-none border border-border bg-background-elevated px-4 py-3 text-sm text-foreground hover:border-primary/40 transition-colors">
                                <span className="font-medium">
                                    Built-in shortcuts and scopes
                                </span>
                                <ChevronDown
                                    size={16}
                                    className="text-muted-foreground transition-transform group-open:rotate-180"
                                />
                            </summary>
                            <div className="mt-4">
                                <KeybindingsContent />
                            </div>
                        </details>
                    </section>

                    {/* Workspace Storage */}
                    <section className="card-deco mb-6">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-8 h-8 bg-primary/10 flex items-center justify-center">
                                <HardDrive size={16} className="text-primary" />
                            </div>
                            <h2 className="text-lg font-medium">
                                Workspace Storage
                            </h2>
                        </div>
                        <p className="text-sm text-muted-foreground mb-5 leading-relaxed">
                            Manage storage used by image attachments in your
                            Convex workspace.
                        </p>

                        {isConvexAvailable &&
                        cloudQuotaStatus &&
                        cloudStorageUsage ? (
                            <div className="space-y-4">
                                <div>
                                    <div className="flex items-center justify-between text-sm mb-2">
                                        <span className="text-muted-foreground">
                                            Workspace Image Storage
                                        </span>
                                        <span className="font-medium">
                                            {formatBytes(cloudQuotaStatus.used)}{" "}
                                            /{" "}
                                            {formatBytes(
                                                cloudQuotaStatus.limit,
                                            )}
                                        </span>
                                    </div>
                                    <div className="h-2 bg-muted border border-border overflow-hidden">
                                        <div
                                            className={cn(
                                                "h-full transition-all duration-300",
                                                cloudQuotaStatus.used /
                                                    cloudQuotaStatus.limit >
                                                    0.9
                                                    ? "bg-error"
                                                    : cloudQuotaStatus.used /
                                                            cloudQuotaStatus.limit >
                                                        0.7
                                                      ? "bg-warning"
                                                      : "bg-primary",
                                            )}
                                            style={{
                                                width: `${Math.min(100, (cloudQuotaStatus.used / cloudQuotaStatus.limit) * 100)}%`,
                                            }}
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="p-3 bg-muted/30 border border-border">
                                        <div className="flex items-center gap-2 text-muted-foreground mb-1">
                                            <HardDrive size={14} />
                                            <span className="text-xs">
                                                Workspace Images
                                            </span>
                                        </div>
                                        <span className="text-lg font-medium">
                                            {formatBytes(
                                                cloudStorageUsage.bytes,
                                            )}
                                        </span>
                                    </div>
                                    <div className="p-3 bg-muted/30 border border-border">
                                        <div className="flex items-center gap-2 text-muted-foreground mb-1">
                                            <Info size={14} />
                                            <span className="text-xs">
                                                Conversations
                                            </span>
                                        </div>
                                        <span className="text-lg font-medium">
                                            {cloudStorageUsage.sessionCount}
                                        </span>
                                    </div>
                                </div>

                                {cloudStorageUsage.bytes > 0 ? (
                                    <button
                                        onClick={handleClearCloudImages}
                                        disabled={clearingCloudStorage}
                                        className="flex items-center gap-2 px-4 py-2 text-error border border-error/30 hover:bg-error/10 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                                    >
                                        {clearingCloudStorage ? (
                                            <Loader2
                                                size={14}
                                                className="animate-spin"
                                            />
                                        ) : (
                                            <Trash2 size={14} />
                                        )}
                                        <span>
                                            {clearingCloudStorage
                                                ? "Clearing..."
                                                : "Clear All Workspace Images"}
                                        </span>
                                    </button>
                                ) : (
                                    <div className="flex items-center gap-2 text-muted-foreground/70 text-sm">
                                        <Check size={14} />
                                        <span>No workspace images stored</span>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="text-sm text-muted-foreground">
                                Sign in to inspect workspace storage.
                            </div>
                        )}
                    </section>

                    {/* About */}
                    <section className="card-deco">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-8 h-8 bg-accent/10 flex items-center justify-center">
                                <Info size={16} className="text-accent" />
                            </div>
                            <h2 className="text-lg font-medium">About</h2>
                        </div>
                        <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
                            Agentchat provides a unified interface for AI
                            conversations through OpenRouter for self-hosted
                            deployments backed by Convex.
                        </p>
                        <details className="group mt-4">
                            <summary className="flex items-center justify-between gap-4 cursor-pointer select-none border border-border bg-background-elevated px-4 py-3 text-sm text-foreground hover:border-primary/40 transition-colors">
                                <span className="font-medium">Learn More</span>
                                <ChevronDown
                                    size={16}
                                    className="text-muted-foreground transition-transform group-open:rotate-180"
                                />
                            </summary>
                            <div className="mt-4 space-y-4">
                                <div className="border border-border bg-muted/20 p-4 space-y-2">
                                    <div className="text-xs uppercase tracking-wider text-muted-foreground">
                                        Self-Hosted
                                    </div>
                                    <p className="text-sm text-muted-foreground leading-relaxed">
                                        Agentchat is designed to run against
                                        your own Convex deployment and your own
                                        agent stack.
                                    </p>
                                </div>
                                <div className="border border-border bg-muted/20 p-4 space-y-2">
                                    <div className="text-xs uppercase tracking-wider text-muted-foreground">
                                        Data Model
                                    </div>
                                    <p className="text-sm text-muted-foreground leading-relaxed">
                                        Chats and attachments are stored in
                                        Convex while model requests are sent
                                        through the deployment&apos;s backend
                                        credential.
                                    </p>
                                </div>
                                <div className="border border-border bg-muted/20 p-4 space-y-2">
                                    <div className="text-xs uppercase tracking-wider text-muted-foreground">
                                        Our Ethos
                                    </div>
                                    <p className="text-sm text-muted-foreground leading-relaxed">
                                        Choose any model available through
                                        OpenRouter and tailor the experience to
                                        your workflow. Agentchat is built to
                                        maximize flexibility and put you in
                                        control.
                                    </p>
                                </div>
                            </div>
                        </details>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground/70 mt-4">
                            <div className="w-1.5 h-1.5 bg-primary rounded-full" />
                            <span>Version 0.2.0</span>
                        </div>
                    </section>
                </div>
            </main>
        </div>
    );
}

export default function SettingsPage() {
    return (
        <Suspense
            fallback={
                <div className="flex h-screen items-center justify-center bg-background text-muted-foreground">
                    Loading settings...
                </div>
            }
        >
            <SettingsPageContent />
        </Suspense>
    );
}
