"use client";

import React, { useState, useRef, useEffect, forwardRef } from "react";
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
    canSend?: boolean;
    selectedModel: string;
    onModelChange: (modelId: string) => void;
    thinkingLevel: ThinkingLevel;
    onThinkingChange: (value: ThinkingLevel) => void;
    reasoningSupported?: boolean;
    searchEnabled: boolean;
    onSearchChange: (enabled: boolean) => void;
    searchSupported?: boolean;
}

export const MessageInput = forwardRef<HTMLTextAreaElement, MessageInputProps>(
    (props, ref) => {
        const {
            onSend,
            disabled,
            canSend = true,
            selectedModel,
            onModelChange,
            thinkingLevel,
            onThinkingChange,
            reasoningSupported = true,
            searchEnabled,
            onSearchChange,
            searchSupported = true,
        } = props;

        const [content, setContent] = useState("");
        const textareaRef = useRef<HTMLTextAreaElement>(null);
        const actualRef =
            (ref as React.RefObject<HTMLTextAreaElement>) || textareaRef;

        const handleSubmit = (e: React.FormEvent) => {
            e.preventDefault();
            if (content.trim() && canSend) {
                onSend(content.trim());
                setContent("");
            }
        };

        const handleKeyDown = (e: React.KeyboardEvent) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (content.trim() && canSend) {
                    onSend(content.trim());
                    setContent("");
                }
            }
        };

        useEffect(() => {
            const textarea = actualRef.current;
            if (textarea) {
                textarea.style.height = "auto";
                textarea.style.height =
                    Math.min(textarea.scrollHeight, 200) + "px";
            }
            // eslint-disable-next-line react-hooks/exhaustive-deps
        }, [content]);

        useEffect(() => {
            if (actualRef.current && actualRef.current.offsetHeight > 0) {
                actualRef.current.focus();
            }
            // eslint-disable-next-line react-hooks/exhaustive-deps
        }, []);

        return (
            <form onSubmit={handleSubmit} className="max-w-4xl mx-auto">
                <div className="relative border border-border bg-background-elevated transition-all duration-200 focus-within:border-primary/40 focus-within:shadow-deco group/input">
                    <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50 bg-muted/20">
                        <ModelSelector
                            selectedModel={selectedModel}
                            onModelChange={onModelChange}
                        />
                        <div className="w-px h-5 bg-border/60" />
                        <SkillSelector disabled={disabled} />
                        <div className="flex-1" />
                        {reasoningSupported && (
                            <ThinkingToggle
                                value={thinkingLevel}
                                onChange={onThinkingChange}
                                disabled={disabled}
                            />
                        )}
                        <SearchToggle
                            enabled={searchEnabled}
                            onChange={onSearchChange}
                            disabled={disabled || !searchSupported}
                        />
                    </div>
                    <div className="relative">
                        <textarea
                            ref={actualRef}
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Send a message..."
                            className={cn(
                                "w-full px-4 py-3.5 pr-14 bg-transparent text-foreground resize-none focus:outline-none",
                                "placeholder:text-muted-foreground",
                            )}
                            rows={1}
                        />
                        <button
                            type="submit"
                            disabled={!content.trim() || !canSend}
                            className={cn(
                                "absolute right-3 bottom-3 p-2.5 transition-all duration-200",
                                content.trim() && canSend
                                    ? "bg-primary text-primary-foreground hover:shadow-deco-glow"
                                    : "bg-muted text-muted-foreground cursor-not-allowed",
                            )}
                        >
                            <Send
                                size={16}
                                className={cn(
                                    "transition-transform",
                                    content.trim() &&
                                        canSend &&
                                        "group-hover/input:translate-x-0.5",
                                )}
                            />
                        </button>
                    </div>
                </div>
                <div className="flex items-center justify-between mt-2 px-1 text-xs text-muted-foreground opacity-60">
                    <span>Shift + Enter for new line</span>
                    <span className={!canSend ? "text-amber-600/70" : ""}>
                        {!canSend
                            ? "Sending... (Enter disabled)"
                            : "Enter to send"}
                    </span>
                </div>
            </form>
        );
    },
);

MessageInput.displayName = "MessageInput";
