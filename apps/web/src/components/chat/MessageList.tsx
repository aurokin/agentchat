"use client";

import React, { useRef, useEffect, useState } from "react";
import type { ChatRunSummary, Message } from "@/lib/types";
import { format } from "date-fns";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import {
    Brain,
    Check,
    MessageCircle,
    ChevronDown,
    ChevronRight,
    Cpu,
    Copy,
} from "lucide-react";
import { cn, externalLinkProps } from "@/lib/utils";
import { MessageListSkeleton } from "./MessageListSkeleton";
import {
    exportConversationAsMarkdown,
    normalizeAssistantDisplayText,
} from "@shared/core/text";

interface MessageListProps {
    messages: Message[];
    sending?: boolean;
    loading?: boolean;
    runSummariesByMessageId?: Map<string, ChatRunSummary>;
}

const markdownComponents: Components = {
    a: ({ children, href, title }) => (
        <a href={href} title={title} {...externalLinkProps}>
            {children}
        </a>
    ),
};

export type MessageRunDisplayState = {
    label: string;
    tone: "live" | "warning" | "error";
    detail: string | null;
};

export function resolveMessageRunDisplayState(params: {
    message: Message;
    runSummary?: ChatRunSummary;
}): MessageRunDisplayState | null {
    const { message, runSummary } = params;
    const status = runSummary?.status ?? message.status ?? null;

    if (status === "running" || status === "streaming") {
        return {
            label:
                runSummary?.latestEventKind === "message_delta"
                    ? "Streaming"
                    : "Running",
            tone: "live",
            detail: null,
        };
    }

    if (status === "interrupted") {
        return {
            label: "Interrupted",
            tone: "warning",
            detail: null,
        };
    }

    if (status === "errored") {
        return {
            label: "Failed",
            tone: "error",
            detail: runSummary?.errorMessage ?? null,
        };
    }

    return null;
}

export function MessageList({
    messages,
    sending,
    loading,
    runSummariesByMessageId,
}: MessageListProps) {
    const bottomRef = useRef<HTMLDivElement>(null);
    const [copiedLatestMessageId, setCopiedLatestMessageId] = useState<
        string | null
    >(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({
            behavior: sending ? "auto" : "smooth",
        });
    }, [messages, sending]);

    useEffect(() => {
        if (!copiedLatestMessageId) {
            return;
        }

        const timeoutId = window.setTimeout(() => {
            setCopiedLatestMessageId(null);
        }, 2000);

        return () => {
            window.clearTimeout(timeoutId);
        };
    }, [copiedLatestMessageId]);

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

    const conversationMarkdown = exportConversationAsMarkdown(messages);

    return (
        <div className="max-w-4xl mx-auto p-6 space-y-8">
            {messages.map((message, index) => (
                <MessageItem
                    key={message.id}
                    message={message}
                    index={index}
                    sending={sending && index === messages.length - 1}
                    runSummary={runSummariesByMessageId?.get(message.id)}
                    canExportConversation={index === messages.length - 1}
                    exportCopied={copiedLatestMessageId === message.id}
                    onExportConversation={async () => {
                        if (!navigator.clipboard?.writeText) {
                            console.error(
                                "Clipboard export is not available in this browser.",
                            );
                            return;
                        }

                        try {
                            await navigator.clipboard.writeText(
                                conversationMarkdown,
                            );
                            setCopiedLatestMessageId(message.id);
                        } catch (error) {
                            console.error(
                                "Failed to copy conversation markdown:",
                                error,
                            );
                        }
                    }}
                />
            ))}

            <div ref={bottomRef} />
        </div>
    );
}

function ReasoningSection({
    reasoning,
    isStreaming,
}: {
    reasoning: string;
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
                        {reasoning}
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
    runSummary,
    canExportConversation,
    exportCopied,
    onExportConversation,
}: {
    message: Message;
    index: number;
    sending?: boolean;
    runSummary?: ChatRunSummary;
    canExportConversation: boolean;
    exportCopied: boolean;
    onExportConversation: () => Promise<void>;
}) {
    const isUser = message.role === "user";
    const isAssistantStatus = !isUser && message.kind === "assistant_status";
    const runState =
        !isUser && !sending
            ? resolveMessageRunDisplayState({ message, runSummary })
            : null;

    const getModelDisplayName = (modelId?: string) => {
        if (!modelId) return "Unknown model";
        const parts = modelId.split("/");
        return parts.length > 1 ? parts[1] : modelId;
    };
    const displayContent = isUser
        ? message.content
        : (normalizeAssistantDisplayText(message.content) ?? message.content);

    return (
        <div
            className={cn(
                "animate-fade-slide-in",
                isUser ? "text-right" : "text-left",
            )}
            style={{ animationDelay: `${index * 30}ms` }}
            data-testid={`message-${message.role}-${message.id}`}
        >
            <div
                className={cn(
                    "flex flex-col",
                    isUser ? "items-end" : "items-start",
                )}
            >
                {message.reasoning && (
                    <ReasoningSection
                        reasoning={message.reasoning}
                        isStreaming={sending && !message.content}
                    />
                )}

                {!(sending && message.reasoning && !message.content) && (
                    <div className="inline-flex max-w-[90%]">
                        <div
                            className={cn(
                                "p-5 prose prose-sm dark:prose-invert max-w-none",
                                isUser
                                    ? "bg-primary/20 border border-primary/30 text-left"
                                    : isAssistantStatus
                                      ? "bg-muted/40 border border-border-accent/70 prose-headings:text-foreground prose-p:text-foreground prose-pre:bg-muted prose-pre:border prose-pre:border-border prose-code:text-primary"
                                      : "bg-background-elevated border border-border prose-headings:text-foreground prose-p:text-foreground prose-pre:bg-muted prose-pre:border prose-pre:border-border prose-code:text-primary",
                            )}
                        >
                            {isAssistantStatus && (
                                <div className="mb-3 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                                    <Cpu size={12} />
                                    <span>Working Note</span>
                                </div>
                            )}
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
                            ) : displayContent ? (
                                <ReactMarkdown
                                    remarkPlugins={[remarkGfm]}
                                    rehypePlugins={[rehypeHighlight]}
                                    components={markdownComponents}
                                >
                                    {displayContent}
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

                    {((message.reasoningEffort &&
                        message.reasoningEffort !== "none") ||
                        message.modelId) && (
                        <span className="w-px h-3 bg-border" />
                    )}

                    {message.reasoningEffort &&
                        message.reasoningEffort !== "none" && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-warning/10 border border-warning/20 text-warning">
                                <Brain size={10} />
                                <span className="uppercase tracking-wider font-medium">
                                    {message.reasoningEffort}
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

                    {runState && (
                        <span
                            className={cn(
                                "inline-flex items-center gap-1 px-1.5 py-0.5 border text-[10px] uppercase tracking-wider font-medium",
                                runState.tone === "live" &&
                                    "bg-primary/10 border-primary/20 text-primary",
                                runState.tone === "warning" &&
                                    "bg-warning/10 border-warning/20 text-warning",
                                runState.tone === "error" &&
                                    "bg-error/10 border-error/20 text-error",
                            )}
                        >
                            {runState.label}
                        </span>
                    )}

                    {canExportConversation && (
                        <>
                            <span className="w-px h-3 bg-border" />
                            <button
                                type="button"
                                onClick={() => {
                                    void onExportConversation();
                                }}
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 border border-border text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors"
                                title="Copy conversation as markdown"
                                aria-label="Copy conversation as markdown"
                            >
                                {exportCopied ? (
                                    <Check size={12} />
                                ) : (
                                    <Copy size={12} />
                                )}
                                <span>
                                    {exportCopied ? "Copied" : "Copy Markdown"}
                                </span>
                            </button>
                        </>
                    )}
                </div>

                {runState?.detail && (
                    <p className="mt-2 max-w-[90%] text-xs text-error/90">
                        {runState.detail}
                    </p>
                )}
            </div>
        </div>
    );
}
