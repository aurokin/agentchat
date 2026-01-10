"use client";

import React, { useState } from "react";
import { Sidebar } from "@/components/chat/Sidebar";
import { useSettings } from "@/contexts/SettingsContext";
import { useUser } from "@clerk/nextjs";
import { validateApiKey } from "@/lib/openrouter";
import type { ThinkingLevel, Skill } from "@/lib/types";
import { ThinkingToggle } from "@/components/chat/ThinkingToggle";
import { SearchToggle } from "@/components/chat/SearchToggle";
import {
    Settings,
    Key,
    Moon,
    Sun,
    Monitor,
    Check,
    X,
    Loader2,
    Terminal,
    Info,
    ExternalLink,
    Brain,
    Globe,
    Book,
    Plus,
    Edit2,
    Trash2,
    ChevronDown,
    ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function SettingsPage() {
    const { user, isLoaded } = useUser();
    const {
        apiKey,
        setApiKey,
        clearApiKey,
        defaultModel,
        setDefaultModel,
        defaultThinking,
        setDefaultThinking,
        defaultSearchEnabled,
        setDefaultSearchEnabled,
        theme,
        setTheme,
        skills,
        addSkill,
        updateSkill,
        deleteSkill,
    } = useSettings();
    const [newApiKey, setNewApiKey] = useState(apiKey || "");
    const [validating, setValidating] = useState(false);
    const [validationResult, setValidationResult] = useState<boolean | null>(
        null,
    );
    const [saving, setSaving] = useState(false);

    // Skill management state
    const [showSkillForm, setShowSkillForm] = useState(false);
    const [editingSkillId, setEditingSkillId] = useState<string | null>(null);
    const [skillName, setSkillName] = useState("");
    const [skillDescription, setSkillDescription] = useState("");
    const [skillPrompt, setSkillPrompt] = useState("");

    // Redirect if not authenticated
    React.useEffect(() => {
        if (isLoaded && !user) {
            window.location.href = "/sign-in";
        }
    }, [isLoaded, user]);

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

    if (!isLoaded || !user) {
        return null;
    }

    return (
        <div className="flex h-screen">
            <Sidebar />
            <main className="flex-1 overflow-y-auto bg-background relative">
                {/* Decorative background */}
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    <div className="absolute top-0 right-0 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
                </div>

                <div className="max-w-2xl mx-auto p-8 relative z-10">
                    {/* Header */}
                    <div className="mb-8">
                        <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
                            <div className="w-10 h-10 bg-primary flex items-center justify-center shadow-brutal-sm">
                                <Settings
                                    size={22}
                                    className="text-primary-foreground"
                                />
                            </div>
                            <span>Settings</span>
                        </h1>
                        <p className="text-muted-foreground mono text-sm">
                            // Configure your preferences
                        </p>
                    </div>

                    {/* OpenRouter API Key */}
                    <section className="card-brutal mb-6">
                        <div className="flex items-center gap-2 mb-4">
                            <Key size={20} className="text-primary" />
                            <h2 className="text-lg font-semibold">
                                OpenRouter API Key
                            </h2>
                        </div>

                        <p className="text-sm text-muted-foreground mb-4 mono">
                            // Enter your OpenRouter API key to enable chatting
                            with AI models.
                            <br />
                            // Your key is stored locally and never sent to our
                            servers.
                        </p>

                        <div className="space-y-4">
                            <div>
                                <label
                                    htmlFor="apiKey"
                                    className="label-brutal"
                                >
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
                                    placeholder="sk-..."
                                    className="input-brutal font-mono"
                                />
                            </div>

                            {apiKey && (
                                <div className="flex items-center gap-2 text-success">
                                    <Check size={16} />
                                    <span className="mono text-sm font-medium">
                                        API_KEY_SAVED
                                    </span>
                                </div>
                            )}

                            <div className="flex flex-wrap gap-2">
                                <button
                                    onClick={handleValidate}
                                    disabled={validating || !newApiKey.trim()}
                                    className="btn-brutal btn-brutal-secondary"
                                >
                                    {validating ? (
                                        <Loader2
                                            size={16}
                                            className="animate-spin"
                                        />
                                    ) : (
                                        <Terminal size={16} />
                                    )}
                                    <span className="mono text-sm">
                                        VALIDATE
                                    </span>
                                </button>

                                <button
                                    onClick={handleSave}
                                    disabled={saving}
                                    className="btn-brutal btn-brutal-primary"
                                >
                                    <span className="mono text-sm">
                                        {saving ? "SAVING..." : "SAVE_KEY"}
                                    </span>
                                </button>

                                {apiKey && (
                                    <button
                                        onClick={handleClear}
                                        className="px-4 py-2.5 text-error border-2 border-error hover:bg-error/10 transition-colors mono text-sm"
                                    >
                                        CLEAR
                                    </button>
                                )}
                            </div>

                            {validationResult === true && (
                                <div className="flex items-center gap-2 text-success">
                                    <Check size={16} />
                                    <span className="mono text-sm font-medium">
                                        // VALID_API_KEY
                                    </span>
                                </div>
                            )}

                            {validationResult === false && (
                                <div className="flex items-center gap-2 text-error">
                                    <X size={16} />
                                    <span className="mono text-sm font-medium">
                                        // INVALID_API_KEY
                                    </span>
                                </div>
                            )}

                            <div className="flex items-center gap-2 text-muted-foreground text-sm p-3 bg-muted border border-border">
                                <ExternalLink size={14} />
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

                    {/* Theme */}
                    <section className="card-brutal mb-6">
                        <div className="flex items-center gap-2 mb-4">
                            <Sun size={20} className="text-warning" />
                            <h2 className="text-lg font-semibold">Theme</h2>
                        </div>

                        <div className="grid grid-cols-3 gap-4">
                            <button
                                onClick={() => setTheme("light")}
                                className={cn(
                                    "p-4 border-2 flex flex-col items-center gap-2 transition-all duration-150",
                                    theme === "light"
                                        ? "border-primary bg-primary/10"
                                        : "border-border hover:border-primary/50",
                                )}
                            >
                                <Sun
                                    size={24}
                                    className={
                                        theme === "light"
                                            ? "text-primary"
                                            : "text-muted-foreground"
                                    }
                                />
                                <span className="mono text-xs">LIGHT</span>
                            </button>

                            <button
                                onClick={() => setTheme("dark")}
                                className={cn(
                                    "p-4 border-2 flex flex-col items-center gap-2 transition-all duration-150",
                                    theme === "dark"
                                        ? "border-primary bg-primary/10"
                                        : "border-border hover:border-primary/50",
                                )}
                            >
                                <Moon
                                    size={24}
                                    className={
                                        theme === "dark"
                                            ? "text-primary"
                                            : "text-muted-foreground"
                                    }
                                />
                                <span className="mono text-xs">DARK</span>
                            </button>

                            <button
                                onClick={() => setTheme("system")}
                                className={cn(
                                    "p-4 border-2 flex flex-col items-center gap-2 transition-all duration-150",
                                    theme === "system"
                                        ? "border-primary bg-primary/10"
                                        : "border-border hover:border-primary/50",
                                )}
                            >
                                <Monitor
                                    size={24}
                                    className={
                                        theme === "system"
                                            ? "text-primary"
                                            : "text-muted-foreground"
                                    }
                                />
                                <span className="mono text-xs">SYSTEM</span>
                            </button>
                        </div>
                    </section>

                    {/* Default Model */}
                    <section className="card-brutal mb-6">
                        <div className="flex items-center gap-2 mb-4">
                            <Settings size={20} className="text-primary" />
                            <h2 className="text-lg font-semibold">
                                Default Model
                            </h2>
                        </div>
                        <p className="text-sm text-muted-foreground mb-4 mono">
                            // Set the default model for new chats
                            <br />
                            // This can be changed per-chat in the chat window
                        </p>
                        <div>
                            <label
                                htmlFor="defaultModel"
                                className="label-brutal"
                            >
                                Default Model ID
                            </label>
                            <input
                                id="defaultModel"
                                type="text"
                                value={defaultModel}
                                onChange={(e) =>
                                    setDefaultModel(e.target.value)
                                }
                                placeholder="minimax/minimax-m2.1"
                                className="input-brutal font-mono"
                            />
                        </div>
                    </section>

                    {/* Default Thinking Level */}
                    <section className="card-brutal mb-6">
                        <div className="flex items-center gap-2 mb-4">
                            <Brain size={20} className="text-warning" />
                            <h2 className="text-lg font-semibold">
                                Default Thinking Level
                            </h2>
                        </div>
                        <p className="text-sm text-muted-foreground mb-4 mono">
                            // Set the default thinking level for new chats
                            <br />
                            // This can be changed per-chat in the chat window
                        </p>
                        <div className="flex items-center gap-4">
                            <ThinkingToggle
                                value={defaultThinking}
                                onChange={(value) =>
                                    setDefaultThinking(value as ThinkingLevel)
                                }
                            />
                            <span className="mono text-sm text-muted-foreground">
                                {defaultThinking === "none" &&
                                    "// Thinking disabled by default"}
                                {defaultThinking === "minimal" &&
                                    "// Minimal thinking effort"}
                                {defaultThinking === "low" &&
                                    "// Low thinking effort"}
                                {defaultThinking === "medium" &&
                                    "// Medium thinking effort"}
                                {defaultThinking === "high" &&
                                    "// High thinking effort"}
                                {defaultThinking === "xhigh" &&
                                    "// Maximum thinking effort"}
                            </span>
                        </div>
                    </section>

                    {/* Default Search */}
                    <section className="card-brutal mb-6">
                        <div className="flex items-center gap-2 mb-4">
                            <Globe size={20} className="text-secondary" />
                            <h2 className="text-lg font-semibold">
                                Default Search
                            </h2>
                        </div>
                        <p className="text-sm text-muted-foreground mb-4 mono">
                            // Enable web search by default for new chats
                            <br />
                            // This can be changed per-chat in the chat window
                        </p>
                        <div className="flex items-center gap-4">
                            <SearchToggle
                                enabled={defaultSearchEnabled}
                                onChange={(enabled) =>
                                    setDefaultSearchEnabled(enabled)
                                }
                            />
                            <span className="mono text-sm text-muted-foreground">
                                {defaultSearchEnabled
                                    ? "// Search enabled by default"
                                    : "// Search disabled by default"}
                            </span>
                        </div>
                    </section>

                    {/* Skills */}
                    <section className="card-brutal mb-6">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                                <Book size={20} className="text-primary" />
                                <h2 className="text-lg font-semibold">
                                    Skills
                                </h2>
                            </div>
                            <button
                                onClick={openNewSkillForm}
                                className="btn-brutal btn-brutal-primary flex items-center gap-2"
                            >
                                <Plus size={16} />
                                <span className="mono text-sm">NEW_SKILL</span>
                            </button>
                        </div>
                        <p className="text-sm text-muted-foreground mb-4 mono">
                            // Create reusable prompt templates
                            <br />
                            // Skills are prepended to your messages when
                            selected
                        </p>

                        {/* Skill Form */}
                        {showSkillForm && (
                            <div className="mb-6 p-4 border-2 border-primary bg-primary/5">
                                <h3 className="font-semibold mb-4 mono text-sm">
                                    {editingSkillId
                                        ? "// EDIT_SKILL"
                                        : "// NEW_SKILL"}
                                </h3>
                                <div className="space-y-4">
                                    <div>
                                        <label
                                            htmlFor="skillName"
                                            className="label-brutal"
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
                                            className="input-brutal"
                                        />
                                    </div>
                                    <div>
                                        <label
                                            htmlFor="skillDescription"
                                            className="label-brutal"
                                        >
                                            Description
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
                                            className="input-brutal"
                                        />
                                    </div>
                                    <div>
                                        <label
                                            htmlFor="skillPrompt"
                                            className="label-brutal"
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
                                            className="input-brutal min-h-[120px] resize-y"
                                        />
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={handleSaveSkill}
                                            disabled={
                                                !skillName.trim() ||
                                                !skillPrompt.trim()
                                            }
                                            className="btn-brutal btn-brutal-primary"
                                        >
                                            <span className="mono text-sm">
                                                {editingSkillId
                                                    ? "UPDATE"
                                                    : "CREATE"}
                                            </span>
                                        </button>
                                        <button
                                            onClick={closeSkillForm}
                                            className="btn-brutal btn-brutal-secondary"
                                        >
                                            <span className="mono text-sm">
                                                CANCEL
                                            </span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Skills List */}
                        {skills.length === 0 ? (
                            <div className="text-center py-8 text-muted-foreground">
                                <Book
                                    size={40}
                                    className="mx-auto mb-3 opacity-50"
                                />
                                <p className="mono text-sm">
                                    // No skills created yet
                                </p>
                                <p className="mono text-xs mt-1">
                                    Click "NEW_SKILL" to create your first skill
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {skills.map((skill) => (
                                    <div
                                        key={skill.id}
                                        className="p-4 border-2 border-border bg-muted/50 hover:border-primary/50 transition-colors"
                                    >
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="flex-1 min-w-0">
                                                <h4 className="font-semibold truncate">
                                                    {skill.name}
                                                </h4>
                                                {skill.description && (
                                                    <p className="text-sm text-muted-foreground truncate mt-1">
                                                        {skill.description}
                                                    </p>
                                                )}
                                                <p className="text-xs text-muted-foreground mono mt-2 line-clamp-2">
                                                    {skill.prompt}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-2 flex-shrink-0">
                                                <button
                                                    onClick={() =>
                                                        openEditSkillForm(skill)
                                                    }
                                                    className="p-2 hover:bg-muted border-2 border-transparent hover:border-border transition-colors"
                                                    title="Edit"
                                                >
                                                    <Edit2 size={14} />
                                                </button>
                                                <button
                                                    onClick={() =>
                                                        handleDeleteSkill(
                                                            skill.id,
                                                        )
                                                    }
                                                    className="p-2 hover:bg-error/10 border-2 border-transparent hover:border-error transition-colors text-error"
                                                    title="Delete"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>

                    {/* About */}
                    <section className="card-brutal">
                        <div className="flex items-center gap-2 mb-4">
                            <Info size={20} className="text-secondary" />
                            <h2 className="text-lg font-semibold">About</h2>
                        </div>
                        <p className="text-sm text-muted-foreground mb-4 mono">
                            // OpenRouter Chat lets you chat with AI models
                            through OpenRouter.
                            <br />
                            // Your conversations are stored locally in your
                            browser.
                        </p>
                        <p className="mono text-xs text-muted-foreground">
                            VERSION 0.1.0
                        </p>
                    </section>
                </div>
            </main>
        </div>
    );
}
