"use client";

import React, { useState, useRef, useEffect } from "react";
import { Send, Command } from "lucide-react";
import { cn } from "@/lib/utils";

interface MessageInputProps {
    onSend: (content: string) => void;
    disabled?: boolean;
}

export function MessageInput({ onSend, disabled }: MessageInputProps) {
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
            <div className="relative group">
                {/* Decorative accent line */}
                <div className="absolute -top-px left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent opacity-0 group-focus-within:opacity-100 transition-opacity" />

                <textarea
                    ref={textareaRef}
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Send a message..."
                    disabled={disabled}
                    className={cn(
                        "w-full px-5 py-4 pr-14 bg-background-elevated border border-border text-foreground transition-all duration-200 resize-none focus:outline-none",
                        "focus:border-primary/50 focus:shadow-deco",
                        "placeholder:text-muted-foreground",
                        disabled && "opacity-50 cursor-not-allowed",
                    )}
                    rows={1}
                />

                <button
                    type="submit"
                    disabled={!content.trim() || disabled}
                    className={cn(
                        "absolute right-3 top-1/2 -translate-y-1/2 p-2.5 transition-all duration-200",
                        content.trim() && !disabled
                            ? "bg-primary text-primary-foreground hover:shadow-deco-glow"
                            : "bg-muted text-muted-foreground cursor-not-allowed",
                    )}
                >
                    <Send
                        size={16}
                        className={cn(
                            "transition-transform",
                            content.trim() && !disabled && "group-hover:translate-x-0.5",
                        )}
                    />
                </button>
            </div>

            <div className="flex items-center justify-between mt-2 px-1">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Command size={12} />
                    <span>+ Shift + Enter for new line</span>
                </div>
                <span className="text-xs text-muted-foreground">
                    Press Enter to send
                </span>
            </div>
        </form>
    );
}
