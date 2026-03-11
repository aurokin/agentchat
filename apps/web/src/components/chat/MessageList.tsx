"use client";

import React, { useRef, useEffect, useState } from "react";
import type { Message } from "@/lib/types";
import { format } from "date-fns";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import {
    Brain,
    MessageCircle,
    ChevronDown,
    ChevronRight,
    Cpu,
} from "lucide-react";
import { cn, externalLinkProps } from "@/lib/utils";
import { MessageListSkeleton } from "./MessageListSkeleton";

interface MessageListProps {
    messages: Message[];
    sending?: boolean;
    loading?: boolean;
}

const markdownComponents: Components = {
    a: ({ children, href, title }) => (
        <a href={href} title={title} {...externalLinkProps}>
            {children}
        </a>
    ),
};

export function MessageList({ messages, sending, loading }: MessageListProps) {
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({
            behavior: sending ? "auto" : "smooth",
        });
    }, [messages, sending]);

    if (loading) {
        return <MessageListSkeleton count={3} />;
    }

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
                    sending={sending && index === messages.length - 1}
                />
            ))}

            <div ref={bottomRef} />
        </div>
    );
}

function ReasoningSection({
    thinking,
    isStreaming,
}: {
    thinking: string;
    isStreaming?: boolean;
}) {
    const [isExpanded, setIsExpanded] = useState(false);

    return (
        <div className="mb-3 inline-flex flex-col max-w-[90%] border border-warning/30 bg-warning/15">
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full flex items-center gap-2 px-4 py-3 text-warning hover:bg-warning/10 active:bg-warning/15 transition-colors cursor-pointer"
            >
                {isExpanded ? (
                    <ChevronDown size={14} />
                ) : (
                    <ChevronRight size={14} />
                )}
                <Brain size={14} />
                <span className="text-xs font-medium uppercase tracking-wider">
                    Reasoning
                </span>

                {isStreaming && (
                    <span className="ml-2 flex items-center gap-1.5 text-warning/70">
                        <span className="typing-indicator flex gap-0.5">
                            <span />
                            <span />
                            <span />
                        </span>
                    </span>
                )}
            </button>
            {isExpanded && (
                <div className="px-4 pb-3 border-t border-warning/20">
                    <p className="text-foreground text-sm whitespace-pre-wrap mono leading-relaxed pt-3 max-h-64 sm:max-h-96 overflow-y-auto">
                        {thinking}
                    </p>
                </div>
            )}
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

    const getModelDisplayName = (modelId?: string) => {
        if (!modelId) return "Unknown model";
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
            <div
                className={cn(
                    "flex flex-col",
                    isUser ? "items-end" : "items-start",
                )}
            >
                {message.thinking && (
                    <ReasoningSection
                        thinking={message.thinking}
                        isStreaming={sending && !message.content}
                    />
                )}

                {!(sending && message.thinking && !message.content) && (
                    <div className="inline-flex max-w-[90%]">
                        <div
                            className={cn(
                                "p-5 prose prose-sm dark:prose-invert max-w-none",
                                isUser
                                    ? "bg-primary/20 border border-primary/30 text-left"
                                    : "bg-background-elevated border border-border prose-headings:text-foreground prose-p:text-foreground prose-pre:bg-muted prose-pre:border prose-pre:border-border prose-code:text-primary",
                            )}
                        >
                            {sending && !message.content ? (
                                <div className="flex items-center gap-3 text-muted-foreground">
                                    <div className="typing-indicator flex gap-1">
                                        <span />
                                        <span />
                                        <span />
                                    </div>
                                    <span className="text-sm">
                                        Generating...
                                    </span>
                                </div>
                            ) : message.content ? (
                                <ReactMarkdown
                                    remarkPlugins={[remarkGfm]}
                                    rehypePlugins={[rehypeHighlight]}
                                    components={markdownComponents}
                                >
                                    {message.content}
                                </ReactMarkdown>
                            ) : (
                                <span className="text-muted-foreground italic">
                                    ...
                                </span>
                            )}
                        </div>
                    </div>
                )}

                <div
                    className={cn(
                        "flex items-center gap-2 mt-2 text-xs",
                        isUser ? "justify-end" : "justify-start",
                    )}
                >
                    <span className="text-muted-foreground">
                        {format(message.createdAt, "h:mm a")}
                    </span>

                    {((message.thinkingLevel &&
                        message.thinkingLevel !== "none") ||
                        message.modelId) && (
                        <span className="w-px h-3 bg-border" />
                    )}

                    {message.thinkingLevel &&
                        message.thinkingLevel !== "none" && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-warning/10 border border-warning/20 text-warning">
                                <Brain size={10} />
                                <span className="uppercase tracking-wider font-medium">
                                    {message.thinkingLevel}
                                </span>
                            </span>
                        )}

                    {message.modelId && (
                        <span
                            className="inline-flex items-center p-1 bg-muted/50 border border-border text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors cursor-default group/model relative"
                            title={getModelDisplayName(message.modelId)}
                        >
                            <Cpu size={12} />
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
