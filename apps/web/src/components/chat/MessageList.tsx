"use client";

import React, { useRef, useEffect, useState } from "react";
import type { Message } from "@/lib/types";
import { format } from "date-fns";
import ReactMarkdown from "react-markdown";
import {
    Brain,
    MessageCircle,
    Copy,
    Check,
    Sparkles,
    ChevronDown,
    ChevronUp,
    Search,
    Cpu,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface MessageListProps {
    messages: Message[];
    sending?: boolean;
}

export function MessageList({ messages, sending }: MessageListProps) {
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, sending]);

    if (messages.length === 0) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="text-center">
                    <div className="inline-flex items-center justify-center w-16 h-16 mb-4 border border-border-accent rounded-full">
                        <MessageCircle
                            size={28}
                            className="text-primary opacity-50"
                        />
                    </div>
                    <p className="text-foreground-muted">No messages yet</p>
                    <p className="text-sm text-muted-foreground mt-1">
                        Start the conversation below
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto p-6 space-y-8">
            {messages.map((message, index) => (
                <MessageItem
                    key={message.id}
                    message={message}
                    index={index}
                    sending={sending && index === messages.length}
                />
            ))}

            {/* Auto-scroll anchor */}
            <div ref={bottomRef} />
        </div>
    );
}

function MessageItem({
    message,
    index,
    sending,
}: {
    message: Message;
    index: number;
    sending?: boolean;
}) {
    const isUser = message.role === "user";
    const [copied, setCopied] = useState(false);
    const [showSkill, setShowSkill] = useState(false);

    const copyToClipboard = async () => {
        if (!navigator.clipboard) {
            return;
        }
        await navigator.clipboard.writeText(message.content || "");
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    // Use skill directly from message (already cloned)
    const skill = message.skill;

    // Check if this is the first user message with a skill
    const isFirstSkillMessage = isUser && skill && index === 0;

    // Get display-friendly model name
    const getModelDisplayName = (modelId?: string) => {
        if (!modelId) return "Unknown model";
        // Extract model name from format like "provider/model-name"
        const parts = modelId.split("/");
        return parts.length > 1 ? parts[1] : modelId;
    };

    return (
        <div
            className={cn(
                "animate-fade-slide-in",
                isUser ? "text-right" : "text-left",
            )}
            style={{ animationDelay: `${index * 30}ms` }}
        >
            <div className="inline-block max-w-[90%] relative group">
                {/* Copy button */}
                {message.content && navigator.clipboard && (
                    <button
                        onClick={copyToClipboard}
                        className="absolute top-3 right-3 p-1.5 bg-background/90 border border-border opacity-0 group-hover:opacity-100 transition-all duration-200 hover:border-primary/30 z-10"
                        title="Copy to clipboard"
                    >
                        {copied ? (
                            <Check size={12} className="text-success" />
                        ) : (
                            <Copy size={12} className="text-muted-foreground" />
                        )}
                    </button>
                )}

                {/* Skill collapsible for first user message */}
                {isFirstSkillMessage && skill && (
                    <details className="mb-3 border border-primary/20 bg-primary/5">
                        <summary
                            className="flex items-center gap-2 px-4 py-2.5 cursor-pointer select-none text-primary"
                            onClick={() => setShowSkill(!showSkill)}
                        >
                            <Sparkles size={14} />
                            <span className="font-medium text-sm">
                                {skill.name}
                            </span>
                            {showSkill ? (
                                <ChevronUp size={14} className="ml-auto" />
                            ) : (
                                <ChevronDown size={14} className="ml-auto" />
                            )}
                        </summary>
                        <div className="px-4 pb-3 text-sm border-t border-primary/10">
                            {skill.description && (
                                <p className="text-muted-foreground py-2">
                                    {skill.description}
                                </p>
                            )}
                            <div className="p-3 bg-muted/50 border border-border mono text-xs whitespace-pre-wrap text-muted-foreground max-h-40 overflow-y-auto">
                                {skill.prompt}
                            </div>
                        </div>
                    </details>
                )}

                {/* Thinking content */}
                {message.thinking && (
                    <div className="mb-3 p-4 bg-warning/5 border-l-2 border-warning">
                        <div className="flex items-center gap-2 text-warning mb-2">
                            <Brain size={14} />
                            <span className="text-xs font-medium uppercase tracking-wider">
                                Thinking
                            </span>
                        </div>
                        <p className="text-warning/80 text-sm whitespace-pre-wrap mono leading-relaxed">
                            {message.thinking}
                        </p>
                    </div>
                )}

                {/* Main content */}
                <div
                    className={cn(
                        "p-5 prose prose-sm dark:prose-invert max-w-none",
                        isUser
                            ? "bg-primary/10 border border-primary/20"
                            : "bg-background-elevated border border-border prose-headings:text-foreground prose-p:text-foreground prose-pre:bg-muted prose-pre:border prose-pre:border-border prose-code:text-primary",
                    )}
                >
                    {sending ? (
                        <div className="flex items-center gap-3 text-muted-foreground">
                            <div className="typing-indicator flex gap-1">
                                <span />
                                <span />
                                <span />
                            </div>
                            <span className="text-sm">Generating...</span>
                        </div>
                    ) : message.content ? (
                        <ReactMarkdown>{message.content}</ReactMarkdown>
                    ) : (
                        <span className="text-muted-foreground italic">
                            ...
                        </span>
                    )}
                </div>

                {/* Message metadata badges */}
                <div
                    className={cn(
                        "flex items-center gap-2 mt-2 text-xs",
                        isUser ? "justify-end" : "justify-start",
                    )}
                >
                    {/* Timestamp */}
                    <span className="text-muted-foreground">
                        {format(message.createdAt, "h:mm a")}
                    </span>

                    {/* Divider */}
                    {(message.searchEnabled ||
                        (message.thinkingLevel &&
                            message.thinkingLevel !== "none") ||
                        message.modelId) && (
                        <span className="w-px h-3 bg-border" />
                    )}

                    {/* Search badge */}
                    {message.searchEnabled && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-accent/10 border border-accent/20 text-accent">
                            <Search size={10} />
                            <span className="uppercase tracking-wider font-medium">
                                Web
                            </span>
                        </span>
                    )}

                    {/* Thinking badge */}
                    {message.thinkingLevel &&
                        message.thinkingLevel !== "none" && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-warning/10 border border-warning/20 text-warning">
                                <Brain size={10} />
                                <span className="uppercase tracking-wider font-medium">
                                    {message.thinkingLevel}
                                </span>
                            </span>
                        )}

                    {/* Model icon with tooltip */}
                    {message.modelId && (
                        <span
                            className="inline-flex items-center p-1 bg-muted/50 border border-border text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors cursor-default group/model relative"
                            title={getModelDisplayName(message.modelId)}
                        >
                            <Cpu size={12} />
                            {/* Tooltip */}
                            <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-background-elevated border border-border text-xs text-foreground whitespace-nowrap opacity-0 group-hover/model:opacity-100 transition-opacity pointer-events-none z-20">
                                {getModelDisplayName(message.modelId)}
                                <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-border" />
                            </span>
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
}
