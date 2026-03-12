"use client";

import React, { useState, useRef, useEffect, forwardRef } from "react";
import { Send, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { ModelSelector } from "./ModelSelector";
import { ThinkingToggle } from "./ThinkingToggle";
import { KeybindingsHelp } from "@/components/keybindings/KeybindingsHelp";
import type { ThinkingLevel } from "@/lib/types";

interface MessageInputProps {
    onSend: (content: string) => void;
    onCancel?: () => void;
    disabled?: boolean;
    canSend?: boolean;
    isSending?: boolean;
    selectedModel: string;
    onModelChange: (modelId: string) => void;
    thinkingLevel: ThinkingLevel;
    onThinkingChange: (value: ThinkingLevel) => void;
    reasoningSupported?: boolean;
}

export const MessageInput = forwardRef<HTMLTextAreaElement, MessageInputProps>(
    (props, ref) => {
        const {
            onSend,
            onCancel,
            disabled,
            canSend = true,
            isSending = false,
            selectedModel,
            onModelChange,
            thinkingLevel,
            onThinkingChange,
            reasoningSupported = true,
        } = props;

        const [content, setContent] = useState("");
        const textareaRef = useRef<HTMLTextAreaElement>(null);
        const actualRef =
            (ref as React.RefObject<HTMLTextAreaElement>) || textareaRef;

        const canSubmit = Boolean(content.trim()) && canSend;

        const submit = () => {
            if (!canSubmit) return;
            onSend(content.trim());
            setContent("");
        };

        const handleSubmit = (e: React.FormEvent) => {
            e.preventDefault();
            submit();
        };

        const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
            const isCtrlJ =
                !e.shiftKey &&
                (e.ctrlKey || e.getModifierState("Control")) &&
                e.key.toLowerCase() === "j";

            if (isCtrlJ) {
                e.preventDefault();
                const target = e.currentTarget;
                const start = target.selectionStart ?? target.value.length;
                const end = target.selectionEnd ?? target.value.length;
                const nextValue = `${target.value.slice(0, start)}\n${target.value.slice(end)}`;
                setContent(nextValue);
                requestAnimationFrame(() => {
                    target.selectionStart = start + 1;
                    target.selectionEnd = start + 1;
                });
                return;
            }

            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
            }
        };

        useEffect(() => {
            const textarea = actualRef.current;
            if (!textarea) return;
            textarea.style.height = "auto";
            textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
        }, [actualRef, content]);

        useEffect(() => {
            if (actualRef.current && actualRef.current.offsetHeight > 0) {
                actualRef.current.focus();
            }
        }, [actualRef]);

        return (
            <form onSubmit={handleSubmit} className="max-w-4xl mx-auto">
                <div className="relative border border-border bg-background-elevated transition-all duration-200 focus-within:border-primary/40 focus-within:shadow-deco group/input">
                    <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50 bg-muted/20">
                        <ModelSelector
                            selectedModel={selectedModel}
                            onModelChange={onModelChange}
                        />
                        <div className="flex-1" />
                        {reasoningSupported && (
                            <ThinkingToggle
                                value={thinkingLevel}
                                onChange={onThinkingChange}
                                disabled={disabled}
                            />
                        )}
                    </div>
                    <div className="relative">
                        <textarea
                            ref={actualRef}
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Send a message..."
                            className={cn(
                                "w-full px-4 py-3.5 bg-transparent text-foreground resize-none pr-20",
                                "placeholder:text-muted-foreground",
                            )}
                            style={{ outline: "none", boxShadow: "none" }}
                            rows={1}
                        />
                        <div className="absolute right-3 bottom-3 flex items-center gap-1">
                            <KeybindingsHelp />
                            {isSending && onCancel ? (
                                <button
                                    type="button"
                                    onClick={onCancel}
                                    className="p-2.5 transition-all duration-200 bg-error/10 text-error hover:bg-error/20"
                                >
                                    <Square size={16} />
                                </button>
                            ) : (
                                <button
                                    type="submit"
                                    disabled={!canSubmit}
                                    className={cn(
                                        "p-2.5 transition-all duration-200",
                                        canSubmit
                                            ? "bg-primary text-primary-foreground hover:shadow-deco-glow"
                                            : "bg-muted text-muted-foreground cursor-not-allowed",
                                    )}
                                >
                                    <Send size={16} />
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </form>
        );
    },
);

MessageInput.displayName = "MessageInput";
