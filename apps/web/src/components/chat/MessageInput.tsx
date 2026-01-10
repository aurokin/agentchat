"use client";

import React, { useState, useRef, useEffect } from "react";
import { Send, CornerDownLeft } from "lucide-react";
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
            <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">
                    <CornerDownLeft size={16} />
                </div>
                <textarea
                    ref={textareaRef}
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Type a message... (Enter to send, Shift+Enter for new line)"
                    disabled={disabled}
                    className={cn(
                        "w-full pl-12 pr-14 py-4 bg-muted border-2 border-border text-foreground transition-all duration-150 resize-none focus:outline-none disabled:bg-muted/50 disabled:cursor-not-allowed",
                        "focus:border-primary focus:shadow-brutal-sm",
                    )}
                    rows={1}
                />
                <button
                    type="submit"
                    disabled={!content.trim() || disabled}
                    className={cn(
                        "absolute right-3 top-1/2 -translate-y-1/2 p-2 transition-all duration-150",
                        content.trim() && !disabled
                            ? "bg-primary text-primary-foreground hover:bg-primary/90 hover:translate-x-0.5"
                            : "bg-border text-muted-foreground cursor-not-allowed",
                    )}
                >
                    <Send size={18} />
                </button>
            </div>
            <div className="flex items-center justify-between mt-2 px-2">
                <span className="mono text-xs text-muted-foreground">
                    // Shift+Enter for new line
                </span>
                <span className="mono text-xs text-muted-foreground">
                    Enter to send
                </span>
            </div>
        </form>
    );
}
