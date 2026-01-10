"use client";

import React, { useState, useRef, useEffect } from "react";
import { Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { ModelSelector } from "./ModelSelector";
import { SkillSelector } from "./SkillSelector";
import { ThinkingToggle } from "./ThinkingToggle";
import { SearchToggle } from "./SearchToggle";
import type { ThinkingLevel } from "@/lib/types";

interface MessageInputProps {
    onSend: (content: string) => void;
    disabled?: boolean;
    // Model controls
    selectedModel: string;
    onModelChange: (modelId: string) => void;
    // Thinking controls
    thinkingLevel: ThinkingLevel;
    onThinkingChange: (value: ThinkingLevel) => void;
    reasoningSupported?: boolean;
    // Search controls
    searchEnabled: boolean;
    onSearchChange: (enabled: boolean) => void;
    searchSupported?: boolean;
}

export function MessageInput({
    onSend,
    disabled,
    selectedModel,
    onModelChange,
    thinkingLevel,
    onThinkingChange,
    reasoningSupported = true,
    searchEnabled,
    onSearchChange,
    searchSupported = true,
}: MessageInputProps) {
    const [content, setContent] = useState("");
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (content.trim() && !disabled) {
            onSend(content.trim());
            setContent("");
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (content.trim() && !disabled) {
                onSend(content.trim());
                setContent("");
            }
        }
    };

    // Auto-resize textarea
    useEffect(() => {
        const textarea = textareaRef.current;
        if (textarea) {
            textarea.style.height = "auto";
            textarea.style.height = Math.min(textarea.scrollHeight, 200) + "px";
        }
    }, [content]);

    return (
        <form onSubmit={handleSubmit} className="max-w-4xl mx-auto">
            {/* Unified input container */}
            <div className="relative border border-border bg-background-elevated transition-all duration-200 focus-within:border-primary/40 focus-within:shadow-deco group/input">
                {/* Controls row */}
                <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50 bg-muted/20">
                    {/* Model selector - compact variant */}
                    <ModelSelector
                        selectedModel={selectedModel}
                        onModelChange={onModelChange}
                    />

                    {/* Vertical divider */}
                    <div className="w-px h-5 bg-border/60" />

                    {/* Skill selector */}
                    <SkillSelector disabled={disabled} />

                    {/* Spacer */}
                    <div className="flex-1" />

                    {/* Thinking toggle - only show if model supports reasoning */}
                    {reasoningSupported && (
                        <ThinkingToggle
                            value={thinkingLevel}
                            onChange={onThinkingChange}
                            disabled={disabled}
                        />
                    )}

                    {/* Search toggle */}
                    <SearchToggle
                        enabled={searchEnabled}
                        onChange={onSearchChange}
                        disabled={disabled || !searchSupported}
                    />
                </div>

                {/* Input row */}
                <div className="relative">
                    <textarea
                        ref={textareaRef}
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Send a message..."
                        disabled={disabled}
                        className={cn(
                            "w-full px-4 py-3.5 pr-14 bg-transparent text-foreground resize-none focus:outline-none",
                            "placeholder:text-muted-foreground",
                            disabled && "opacity-50 cursor-not-allowed",
                        )}
                        rows={1}
                    />

                    <button
                        type="submit"
                        disabled={!content.trim() || disabled}
                        className={cn(
                            "absolute right-3 bottom-3 p-2.5 transition-all duration-200",
                            content.trim() && !disabled
                                ? "bg-primary text-primary-foreground hover:shadow-deco-glow"
                                : "bg-muted text-muted-foreground cursor-not-allowed",
                        )}
                    >
                        <Send
                            size={16}
                            className={cn(
                                "transition-transform",
                                content.trim() &&
                                    !disabled &&
                                    "group-hover/input:translate-x-0.5",
                            )}
                        />
                    </button>
                </div>
            </div>

            {/* Keyboard hints */}
            <div className="flex items-center justify-between mt-2 px-1 text-xs text-muted-foreground opacity-60">
                <span>Shift + Enter for new line</span>
                <span>Enter to send</span>
            </div>
        </form>
    );
}
