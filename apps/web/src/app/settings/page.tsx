"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/chat/Sidebar";
import { KeybindingsContent } from "@/components/keybindings/KeybindingsContent";
import { useChat } from "@/contexts/ChatContext";
import { useSync } from "@/contexts/SyncContext";
import { useSettings } from "@/contexts/SettingsContext";
import { validateApiKey } from "@/lib/openrouter";
import type { Skill } from "@/lib/types";
import {
    getStorageUsage,
    cleanupOldAttachments,
    MAX_TOTAL_STORAGE,
} from "@/lib/db";
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
    Book,
    Plus,
    Edit2,
    Trash2,
    Info,
    Hexagon,
    Image as ImageIcon,
    HardDrive,
    Keyboard,
    ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
const CloudSyncSettings = dynamic(
    () =>
        import("@/components/sync/CloudSyncSettings").then(
            (mod) => mod.CloudSyncSettings,
        ),
    { ssr: false },
);

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

export default function SettingsPage() {
    const router = useRouter();
    const { currentChat, clearCurrentChat } = useChat();
    const {
        cloudQuotaStatus,
        cloudStorageUsage,
        clearCloudImages,
        isConvexAvailable,
        localQuotaStatus,
        refreshQuotaStatus,
    } = useSync();
    const {
        apiKey,
        setApiKey,
        clearApiKey,
        theme,
        setTheme,
        skills,
        addSkill,
        updateSkill,
        deleteSkill,
    } = useSettings();
    const [newApiKey, setNewApiKey] = useState(apiKey || "");
    const lastApiKeyRef = useRef<string | null>(apiKey ?? null);
    const [validating, setValidating] = useState(false);
    const [validationResult, setValidationResult] = useState<boolean | null>(
        null,
    );
    const [saving, setSaving] = useState(false);

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
                "This will delete all image attachments from your conversations. This cannot be undone. Continue?",
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
                "This will delete all cloud image attachments from your conversations. This cannot be undone. Continue?",
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

    // Skill management state
    const [showSkillForm, setShowSkillForm] = useState(false);
    const [editingSkillId, setEditingSkillId] = useState<string | null>(null);
    const [skillName, setSkillName] = useState("");
    const [skillDescription, setSkillDescription] = useState("");
    const [skillPrompt, setSkillPrompt] = useState("");

    const handleValidate = async () => {
        if (!newApiKey.trim()) return;
        setValidating(true);
        setValidationResult(null);
        const isValid = await validateApiKey(newApiKey.trim());
        setValidationResult(isValid);
        setValidating(false);
    };

    const handleSave = () => {
        setSaving(true);
        if (newApiKey.trim()) {
            setApiKey(newApiKey.trim());
        } else {
            clearApiKey();
        }
        setSaving(false);
    };

    const handleClear = () => {
        setNewApiKey("");
        clearApiKey();
        setValidationResult(null);
    };

    // Skill management handlers
    const openNewSkillForm = () => {
        setEditingSkillId(null);
        setSkillName("");
        setSkillDescription("");
        setSkillPrompt("");
        setShowSkillForm(true);
    };

    const openEditSkillForm = (skill: Skill) => {
        setEditingSkillId(skill.id);
        setSkillName(skill.name);
        setSkillDescription(skill.description);
        setSkillPrompt(skill.prompt);
        setShowSkillForm(true);
    };

    const closeSkillForm = () => {
        setShowSkillForm(false);
        setEditingSkillId(null);
        setSkillName("");
        setSkillDescription("");
        setSkillPrompt("");
    };

    const handleSaveSkill = () => {
        if (!skillName.trim() || !skillPrompt.trim()) return;

        if (editingSkillId) {
            updateSkill(editingSkillId, {
                name: skillName.trim(),
                description: skillDescription.trim(),
                prompt: skillPrompt.trim(),
            });
        } else {
            addSkill({
                name: skillName.trim(),
                description: skillDescription.trim(),
                prompt: skillPrompt.trim(),
            });
        }

        closeSkillForm();
    };

    const handleDeleteSkill = (id: string) => {
        if (confirm("Are you sure you want to delete this skill?")) {
            deleteSkill(id);
        }
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
                    <section className="card-deco mb-6">
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
                            access. Your key is stored locally and never sent to
                            our servers.
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
                            </div>

                            {apiKey && (
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
                                    disabled={validating || !newApiKey.trim()}
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
                                    disabled={saving}
                                    className="btn-deco btn-deco-primary cursor-pointer"
                                >
                                    <span className="text-sm">
                                        {saving ? "Saving..." : "Save Key"}
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
                                        target="_blank"
                                        rel="noopener noreferrer"
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

                    {/* Skills */}
                    <section className="card-deco mb-6">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 bg-primary/10 flex items-center justify-center">
                                    <Book size={16} className="text-primary" />
                                </div>
                                <h2 className="text-lg font-medium">Skills</h2>
                            </div>
                            <button
                                onClick={openNewSkillForm}
                                className="btn-deco btn-deco-primary flex items-center gap-2 cursor-pointer"
                            >
                                <Plus size={14} />
                                <span className="text-sm">New Skill</span>
                            </button>
                        </div>
                        <p className="text-sm text-muted-foreground mb-3 leading-relaxed">
                            Create reusable prompt templates that are prepended
                            to your messages when selected.
                        </p>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                            The last skill you pick becomes the default for new
                            chats and applies to the first message only. Choose
                            None to clear it.
                        </p>

                        {/* Skill Form */}
                        {showSkillForm && (
                            <div className="mb-6 p-5 border border-primary/30 bg-primary/5">
                                <h3 className="font-medium mb-4 text-primary">
                                    {editingSkillId
                                        ? "Edit Skill"
                                        : "New Skill"}
                                </h3>
                                <div className="space-y-4">
                                    <div>
                                        <label
                                            htmlFor="skillName"
                                            className="label-deco"
                                        >
                                            Name
                                        </label>
                                        <input
                                            id="skillName"
                                            type="text"
                                            value={skillName}
                                            onChange={(e) =>
                                                setSkillName(e.target.value)
                                            }
                                            placeholder="e.g., Code Reviewer"
                                            className="input-deco"
                                        />
                                    </div>
                                    <div>
                                        <label
                                            htmlFor="skillDescription"
                                            className="label-deco"
                                        >
                                            Description (optional)
                                        </label>
                                        <input
                                            id="skillDescription"
                                            type="text"
                                            value={skillDescription}
                                            onChange={(e) =>
                                                setSkillDescription(
                                                    e.target.value,
                                                )
                                            }
                                            placeholder="e.g., Expert at reviewing code for bugs"
                                            className="input-deco"
                                        />
                                    </div>
                                    <div>
                                        <label
                                            htmlFor="skillPrompt"
                                            className="label-deco"
                                        >
                                            Prompt
                                        </label>
                                        <textarea
                                            id="skillPrompt"
                                            value={skillPrompt}
                                            onChange={(e) =>
                                                setSkillPrompt(e.target.value)
                                            }
                                            placeholder="You are an expert code reviewer..."
                                            className="input-deco min-h-[120px] resize-y"
                                        />
                                    </div>
                                    <div className="flex gap-3">
                                        <button
                                            onClick={handleSaveSkill}
                                            disabled={
                                                !skillName.trim() ||
                                                !skillPrompt.trim()
                                            }
                                            className="btn-deco btn-deco-primary cursor-pointer"
                                        >
                                            <span className="text-sm">
                                                {editingSkillId
                                                    ? "Update"
                                                    : "Create"}
                                            </span>
                                        </button>
                                        <button
                                            onClick={closeSkillForm}
                                            className="btn-deco btn-deco-secondary cursor-pointer"
                                        >
                                            <span className="text-sm">
                                                Cancel
                                            </span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Skills List */}
                        {skills.length === 0 ? (
                            <div className="text-center py-10 text-muted-foreground border border-dashed border-border bg-muted/20">
                                <Book
                                    size={36}
                                    className="mx-auto mb-3 opacity-40"
                                />
                                <p className="text-sm">No skills created yet</p>
                                <p className="text-xs mt-1 opacity-70">
                                    Click &quot;New Skill&quot; to create your
                                    first skill
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {skills.map((skill) => (
                                    <div
                                        key={skill.id}
                                        className="p-4 border border-border bg-background-elevated hover:border-primary/30 transition-all duration-200 group"
                                    >
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="flex-1 min-w-0">
                                                <h4 className="font-medium truncate text-foreground">
                                                    {skill.name}
                                                </h4>
                                                {skill.description && (
                                                    <p className="text-sm text-muted-foreground truncate mt-1">
                                                        {skill.description}
                                                    </p>
                                                )}
                                                <p className="text-xs text-muted-foreground/70 mt-2 line-clamp-2 font-mono">
                                                    {skill.prompt}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={() =>
                                                        openEditSkillForm(skill)
                                                    }
                                                    className="p-2 hover:bg-muted border border-transparent hover:border-border transition-colors"
                                                    title="Edit"
                                                >
                                                    <Edit2
                                                        size={14}
                                                        className="text-muted-foreground hover:text-foreground"
                                                    />
                                                </button>
                                                <button
                                                    onClick={() =>
                                                        handleDeleteSkill(
                                                            skill.id,
                                                        )
                                                    }
                                                    className="p-2 hover:bg-error/10 border border-transparent hover:border-error/30 transition-colors"
                                                    title="Delete"
                                                >
                                                    <Trash2
                                                        size={14}
                                                        className="text-error"
                                                    />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
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
                                            / {formatBytes(MAX_TOTAL_STORAGE)}
                                        </span>
                                    </div>
                                    <div className="h-2 bg-muted border border-border overflow-hidden">
                                        <div
                                            className={cn(
                                                "h-full transition-all duration-300",
                                                storageUsage.attachments /
                                                    MAX_TOTAL_STORAGE >
                                                    0.9
                                                    ? "bg-error"
                                                    : storageUsage.attachments /
                                                            MAX_TOTAL_STORAGE >
                                                        0.7
                                                      ? "bg-warning"
                                                      : "bg-primary",
                                            )}
                                            style={{
                                                width: `${Math.min(100, (storageUsage.attachments / MAX_TOTAL_STORAGE) * 100)}%`,
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

                    {/* Cloud Sync - only shown when Convex is available */}
                    <CloudSyncSettings />

                    {/* About */}
                    <section className="card-deco">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-8 h-8 bg-accent/10 flex items-center justify-center">
                                <Info size={16} className="text-accent" />
                            </div>
                            <h2 className="text-lg font-medium">About</h2>
                        </div>
                        <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
                            RouterChat provides a unified interface for AI
                            conversations through OpenRouter, with a flexible
                            setup that lets you choose how your data is stored.
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
                                        Local Only
                                    </div>
                                    <p className="text-sm text-muted-foreground leading-relaxed">
                                        RouterChat works offline by default.
                                        Your data stays on this device, and
                                        requests are sent directly to OpenRouter
                                        using your API key.
                                    </p>
                                </div>
                                <div className="border border-border bg-muted/20 p-4 space-y-2">
                                    <div className="text-xs uppercase tracking-wider text-muted-foreground">
                                        Cloud Sync
                                    </div>
                                    <p className="text-sm text-muted-foreground leading-relaxed">
                                        Enable cloud sync with a Pro
                                        subscription. Sync is powered by Convex,
                                        and API keys are stored in encrypted
                                        form for additional safety.
                                    </p>
                                </div>
                                <div className="border border-border bg-muted/20 p-4 space-y-2">
                                    <div className="text-xs uppercase tracking-wider text-muted-foreground">
                                        Our Ethos
                                    </div>
                                    <p className="text-sm text-muted-foreground leading-relaxed">
                                        Choose any model available through
                                        OpenRouter and tailor the experience to
                                        your workflow. RouterChat is built to
                                        maximize flexibility and put you in
                                        control.
                                    </p>
                                </div>
                            </div>
                        </details>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground/70 mt-4">
                            <div className="w-1.5 h-1.5 bg-primary rounded-full" />
                            <span>Version 0.1.1</span>
                        </div>
                    </section>
                </div>
            </main>
        </div>
    );
}
