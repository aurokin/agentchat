"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Sidebar } from "@/components/chat/Sidebar";
import { KeybindingsContent } from "@/components/keybindings/KeybindingsContent";
import { useChat } from "@/contexts/ChatContext";
import { useSync } from "@/contexts/SyncContext";
import { useSettings } from "@/contexts/SettingsContext";
import { validateApiKey } from "@/lib/openrouter";
import { getStorageUsage, cleanupOldAttachments } from "@/lib/db";
import { LOCAL_IMAGE_QUOTA } from "@shared/core/quota";
import {
    Settings,
    Key,
    Moon,
    Sun,
    Monitor,
    Check,
    X,
    Loader2,
    Shield,
    ExternalLink,
    Trash2,
    Info,
    Hexagon,
    Image as ImageIcon,
    HardDrive,
    Keyboard,
    ChevronDown,
} from "lucide-react";
import { cn, externalLinkProps } from "@/lib/utils";

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
        localQuotaStatus,
        refreshQuotaStatus,
        syncState,
    } = useSync();
    const { apiKey, setApiKey, clearApiKey, theme, setTheme } = useSettings();
    const [newApiKey, setNewApiKey] = useState(apiKey || "");
    const lastApiKeyRef = useRef<string | null>(apiKey ?? null);
    const [validating, setValidating] = useState(false);
    const [validationResult, setValidationResult] = useState<boolean | null>(
        null,
    );
    const [saving, setSaving] = useState(false);
    const searchParams = useSearchParams();
    const [highlightApiKey, setHighlightApiKey] = useState(false);

    useEffect(() => {
        if (typeof window === "undefined") return;
        const highlight = searchParams.get("highlight");
        setHighlightApiKey(highlight === "api-key");

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

        if (!highlight) return;
        const timeout = window.setTimeout(() => {
            setHighlightApiKey(false);
        }, 4000);
        return () => window.clearTimeout(timeout);
    }, [searchParams]);

    // Storage management state
    const [storageUsage, setStorageUsage] = useState<{
        attachments: number;
        messages: number;
        sessions: number;
    } | null>(null);
    const [loadingStorage, setLoadingStorage] = useState(true);
    const [clearingStorage, setClearingStorage] = useState(false);
    const [clearingCloudStorage, setClearingCloudStorage] = useState(false);
    const previousLocalUsageRef = useRef<number | null>(null);

    // Load storage usage on mount
    const loadStorageUsage = useCallback(async () => {
        try {
            const usage = await getStorageUsage();
            setStorageUsage(usage);
        } catch (error) {
            console.error("Failed to load storage usage:", error);
        } finally {
            setLoadingStorage(false);
        }
    }, []);

    useEffect(() => {
        loadStorageUsage();
    }, [loadStorageUsage]);

    useEffect(() => {
        const previousUsage = previousLocalUsageRef.current;
        previousLocalUsageRef.current = localQuotaStatus.used;
        if (previousUsage !== null && previousUsage !== localQuotaStatus.used) {
            loadStorageUsage();
        }
    }, [localQuotaStatus.used, loadStorageUsage]);

    useEffect(() => {
        if (apiKey !== lastApiKeyRef.current) {
            const lastApiKey = lastApiKeyRef.current ?? "";
            if (!newApiKey || newApiKey === lastApiKey) {
                setNewApiKey(apiKey ?? "");
            }
            lastApiKeyRef.current = apiKey ?? null;
        }
    }, [apiKey, newApiKey]);

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

    const handleClearAttachments = async () => {
        if (
            !confirm(
                "This will remove all images from your local conversations. You'll see placeholders where images used to be. This cannot be undone. Continue?",
            )
        ) {
            return;
        }

        setClearingStorage(true);
        try {
            await cleanupOldAttachments(0); // Clear all by setting max to 0
            await loadStorageUsage();
        } catch (error) {
            console.error("Failed to clear attachments:", error);
        } finally {
            setClearingStorage(false);
        }
    };

    const handleClearCloudImages = async () => {
        if (
            !confirm(
                "This will remove all images from your cloud conversations. You'll see placeholders where images used to be. This cannot be undone. Continue?",
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

    const validateCurrentKey = async (key: string) => {
        setValidating(true);
        setValidationResult(null);
        const isValid = await validateApiKey(key);
        setValidationResult(isValid);
        setValidating(false);
        return isValid;
    };

    const handleValidate = async () => {
        const trimmedKey = newApiKey.trim();
        if (!trimmedKey) return;
        await validateCurrentKey(trimmedKey);
    };

    const handleSave = async () => {
        const trimmedKey = newApiKey.trim();
        setSaving(true);
        try {
            // Only allow saving an unvalidated key if the user is explicitly clearing it.
            if (!trimmedKey) {
                clearApiKey();
                setValidationResult(null);
                return;
            }

            const isValid = await validateCurrentKey(trimmedKey);
            if (!isValid) return;

            setApiKey(trimmedKey);
        } finally {
            setSaving(false);
        }
    };

    const handleClear = () => {
        setNewApiKey("");
        clearApiKey();
        setValidationResult(null);
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

                    {/* OpenRouter API Key */}
                    <section
                        id="api-key"
                        className={cn(
                            "card-deco mb-6",
                            highlightApiKey &&
                                "ring-2 ring-primary/40 shadow-deco",
                        )}
                    >
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-8 h-8 bg-primary/10 flex items-center justify-center">
                                <Key size={16} className="text-primary" />
                            </div>
                            <h2 className="text-lg font-medium">
                                OpenRouter API Key
                            </h2>
                        </div>

                        <p className="text-sm text-muted-foreground mb-5 leading-relaxed">
                            Enter your OpenRouter API key to enable AI model
                            access. Requests are sent directly to OpenRouter
                            from your device.
                        </p>

                        <div className="space-y-4">
                            <div>
                                <label htmlFor="apiKey" className="label-deco">
                                    API Key
                                </label>
                                <input
                                    id="apiKey"
                                    type="password"
                                    value={newApiKey}
                                    onChange={(e) => {
                                        setNewApiKey(e.target.value);
                                        setValidationResult(null);
                                    }}
                                    placeholder="sk-or-..."
                                    className="input-deco font-mono"
                                />
                                <div className="mt-2 text-xs text-muted-foreground">
                                    {syncState === "cloud-enabled"
                                        ? "Stored in Convex (encrypted)."
                                        : "Sign in to store your key in Convex."}
                                </div>
                            </div>

                            {apiKey && newApiKey.trim() === apiKey && (
                                <div className="flex items-center gap-2 text-success px-3 py-2 bg-success/5 border border-success/20">
                                    <Check size={14} />
                                    <span className="text-sm font-medium">
                                        API key saved
                                    </span>
                                </div>
                            )}

                            <div className="flex flex-wrap gap-3">
                                <button
                                    onClick={handleValidate}
                                    disabled={
                                        validating ||
                                        saving ||
                                        !newApiKey.trim()
                                    }
                                    className="btn-deco btn-deco-secondary cursor-pointer"
                                >
                                    {validating ? (
                                        <Loader2
                                            size={14}
                                            className="animate-spin"
                                        />
                                    ) : (
                                        <Shield size={14} />
                                    )}
                                    <span className="text-sm">Validate</span>
                                </button>

                                <button
                                    onClick={handleSave}
                                    disabled={saving || validating}
                                    className="btn-deco btn-deco-primary cursor-pointer"
                                >
                                    <span className="text-sm">
                                        {validating
                                            ? "Validating..."
                                            : saving
                                              ? "Saving..."
                                              : "Save Key"}
                                    </span>
                                </button>

                                {apiKey && (
                                    <button
                                        onClick={handleClear}
                                        className="px-4 py-2 text-error border border-error/30 hover:bg-error/10 transition-colors text-sm cursor-pointer"
                                    >
                                        Clear
                                    </button>
                                )}
                            </div>

                            {validationResult === true && (
                                <div className="flex items-center gap-2 text-success px-3 py-2 bg-success/5 border border-success/20">
                                    <Check size={14} />
                                    <span className="text-sm font-medium">
                                        Valid API key
                                    </span>
                                </div>
                            )}

                            {validationResult === false && (
                                <div className="flex items-center gap-2 text-error px-3 py-2 bg-error/5 border border-error/20">
                                    <X size={14} />
                                    <span className="text-sm font-medium">
                                        Invalid API key
                                    </span>
                                </div>
                            )}

                            <div className="flex items-center gap-2 text-muted-foreground text-sm p-3 bg-muted/30 border border-border">
                                <ExternalLink
                                    size={14}
                                    className="flex-shrink-0"
                                />
                                <span>
                                    Get your API key from{" "}
                                    <a
                                        href="https://openrouter.ai/keys"
                                        {...externalLinkProps}
                                        className="text-primary hover:underline"
                                    >
                                        openrouter.ai/keys
                                    </a>
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

                    {/* Image Storage */}
                    <section className="card-deco mb-6">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-8 h-8 bg-primary/10 flex items-center justify-center">
                                <HardDrive size={16} className="text-primary" />
                            </div>
                            <h2 className="text-lg font-medium">
                                Image Storage
                            </h2>
                        </div>
                        <p className="text-sm text-muted-foreground mb-5 leading-relaxed">
                            Manage storage used by image attachments in your
                            conversations.
                        </p>

                        {loadingStorage ? (
                            <div className="flex items-center gap-2 text-muted-foreground">
                                <Loader2 size={14} className="animate-spin" />
                                <span className="text-sm">
                                    Loading storage info...
                                </span>
                            </div>
                        ) : storageUsage ? (
                            <div className="space-y-4">
                                {/* Local storage bar */}
                                <div>
                                    <div className="flex items-center justify-between text-sm mb-2">
                                        <span className="text-muted-foreground">
                                            Local Image Storage
                                        </span>
                                        <span className="font-medium">
                                            {formatBytes(
                                                storageUsage.attachments,
                                            )}{" "}
                                            / {formatBytes(LOCAL_IMAGE_QUOTA)}
                                        </span>
                                    </div>
                                    <div className="h-2 bg-muted border border-border overflow-hidden">
                                        <div
                                            className={cn(
                                                "h-full transition-all duration-300",
                                                storageUsage.attachments /
                                                    LOCAL_IMAGE_QUOTA >
                                                    0.9
                                                    ? "bg-error"
                                                    : storageUsage.attachments /
                                                            LOCAL_IMAGE_QUOTA >
                                                        0.7
                                                      ? "bg-warning"
                                                      : "bg-primary",
                                            )}
                                            style={{
                                                width: `${Math.min(100, (storageUsage.attachments / LOCAL_IMAGE_QUOTA) * 100)}%`,
                                            }}
                                        />
                                    </div>
                                </div>

                                {/* Stats */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="p-3 bg-muted/30 border border-border">
                                        <div className="flex items-center gap-2 text-muted-foreground mb-1">
                                            <ImageIcon size={14} />
                                            <span className="text-xs">
                                                Images
                                            </span>
                                        </div>
                                        <span className="text-lg font-medium">
                                            {formatBytes(
                                                storageUsage.attachments,
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
                                            {storageUsage.sessions}
                                        </span>
                                    </div>
                                </div>

                                {/* Clear button */}
                                {storageUsage.attachments > 0 && (
                                    <button
                                        onClick={handleClearAttachments}
                                        disabled={clearingStorage}
                                        className="flex items-center gap-2 px-4 py-2 text-error border border-error/30 hover:bg-error/10 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                                    >
                                        {clearingStorage ? (
                                            <Loader2
                                                size={14}
                                                className="animate-spin"
                                            />
                                        ) : (
                                            <Trash2 size={14} />
                                        )}
                                        <span>
                                            {clearingStorage
                                                ? "Clearing..."
                                                : "Clear All Local Images"}
                                        </span>
                                    </button>
                                )}

                                {storageUsage.attachments === 0 && (
                                    <div className="flex items-center gap-2 text-muted-foreground/70 text-sm">
                                        <Check size={14} />
                                        <span>No images stored</span>
                                    </div>
                                )}

                                {isConvexAvailable &&
                                    cloudQuotaStatus &&
                                    cloudStorageUsage && (
                                        <div className="space-y-4 border-t border-border/60 pt-4">
                                            <div>
                                                <div className="flex items-center justify-between text-sm mb-2">
                                                    <span className="text-muted-foreground">
                                                        Cloud Image Storage
                                                    </span>
                                                    <span className="font-medium">
                                                        {formatBytes(
                                                            cloudQuotaStatus.used,
                                                        )}{" "}
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
                                                        <ImageIcon size={14} />
                                                        <span className="text-xs">
                                                            Cloud Images
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
                                                            Cloud Conversations
                                                        </span>
                                                    </div>
                                                    <span className="text-lg font-medium">
                                                        {
                                                            cloudStorageUsage.sessionCount
                                                        }
                                                    </span>
                                                </div>
                                            </div>

                                            {cloudStorageUsage.bytes > 0 && (
                                                <button
                                                    onClick={
                                                        handleClearCloudImages
                                                    }
                                                    disabled={
                                                        clearingCloudStorage
                                                    }
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
                                                            : "Clear All Cloud Images"}
                                                    </span>
                                                </button>
                                            )}

                                            {cloudStorageUsage.bytes === 0 && (
                                                <div className="flex items-center gap-2 text-muted-foreground/70 text-sm">
                                                    <Check size={14} />
                                                    <span>
                                                        No cloud images stored
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    )}
                            </div>
                        ) : (
                            <div className="text-sm text-muted-foreground">
                                Unable to load storage information
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
                                        Chats and encrypted API keys are stored
                                        in Convex while the app is running in
                                        Convex-only mode.
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
