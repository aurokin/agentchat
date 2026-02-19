"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import type { Message, Attachment } from "@/lib/types";
import { format } from "date-fns";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import {
    Brain,
    MessageCircle,
    Sparkles,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    Search,
    Cpu,
    Image as ImageIcon,
} from "lucide-react";
import { cn, externalLinkProps } from "@/lib/utils";
import { MessageListSkeleton } from "./MessageListSkeleton";
import { ImageGalleryDialog, type GalleryImage } from "./ImageGalleryDialog";
import { useStorageAdapter } from "@/contexts/SyncContext";
import { createDataUrl } from "@/lib/imageProcessing";

interface MessageListProps {
    messages: Message[];
    sending?: boolean;
    loading?: boolean;
}

export function MessageList({ messages, sending, loading }: MessageListProps) {
    const storageAdapter = useStorageAdapter();
    const bottomRef = useRef<HTMLDivElement>(null);
    const [galleryOpen, setGalleryOpen] = useState(false);
    const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
    const [allImages, setAllImages] = useState<GalleryImage[]>([]);
    const lastImageKeyRef = useRef<string | null>(null);
    const lastAdapterRef = useRef<unknown>(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({
            behavior: sending ? "auto" : "smooth",
        });
    }, [messages, sending]);

    // Collect all images from all messages
    useEffect(() => {
        // Avoid re-fetching images while streaming messages (when attachment IDs haven't changed).
        const attachmentIds: string[] = [];
        for (const message of messages) {
            if (message.attachmentIds?.length) {
                attachmentIds.push(...message.attachmentIds);
            }
        }
        const nextKey = attachmentIds.join("|");

        if (lastAdapterRef.current !== storageAdapter) {
            lastAdapterRef.current = storageAdapter;
            lastImageKeyRef.current = null;
        }

        if (lastImageKeyRef.current === nextKey) {
            return;
        }
        lastImageKeyRef.current = nextKey;

        let cancelled = false;

        async function collectImages() {
            const images: GalleryImage[] = [];

            for (const message of messages) {
                if (message.attachmentIds && message.attachmentIds.length > 0) {
                    for (const attachmentId of message.attachmentIds) {
                        const attachment =
                            await storageAdapter.getAttachment(attachmentId);
                        if (
                            attachment &&
                            !attachment.purgedAt &&
                            attachment.data
                        ) {
                            images.push({
                                id: attachment.id,
                                src: createDataUrl(
                                    attachment.data,
                                    attachment.mimeType,
                                ),
                                alt: `Image ${attachment.width}x${attachment.height}`,
                                timestamp: attachment.createdAt,
                            });
                        }
                    }
                }
            }

            if (!cancelled) {
                setAllImages(images);
            }
        }

        void collectImages();

        return () => {
            cancelled = true;
        };
    }, [messages, storageAdapter]);

    const handleImageClick = useCallback((imageId: string) => {
        setSelectedImageId(imageId);
        setGalleryOpen(true);
    }, []);

    const handleGalleryClose = useCallback(() => {
        setGalleryOpen(false);
        setSelectedImageId(null);
    }, []);

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
        <>
            <div className="max-w-4xl mx-auto p-6 space-y-8">
                {messages.map((message, index) => (
                    <MessageItem
                        key={message.id}
                        message={message}
                        index={index}
                        sending={sending && index === messages.length - 1}
                        onImageClick={handleImageClick}
                    />
                ))}

                {/* Auto-scroll anchor */}
                <div ref={bottomRef} />
            </div>

            <ImageGalleryDialog
                open={galleryOpen}
                images={allImages}
                initialImageId={selectedImageId ?? undefined}
                onClose={handleGalleryClose}
            />
        </>
    );
}

interface ReasoningSectionProps {
    thinking: string;
    isStreaming?: boolean;
}

function ReasoningSection({ thinking, isStreaming }: ReasoningSectionProps) {
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

// Component to display message attachments
function MessageAttachments({
    attachmentIds,
    onImageClick,
}: {
    attachmentIds: string[];
    onImageClick: (imageId: string) => void;
}) {
    const storageAdapter = useStorageAdapter();
    const [attachments, setAttachments] = useState<Attachment[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function loadAttachments() {
            const loaded: Attachment[] = [];
            for (const id of attachmentIds) {
                const attachment = await storageAdapter.getAttachment(id);
                if (attachment) {
                    loaded.push(attachment);
                }
            }
            setAttachments(loaded);
            setLoading(false);
        }
        loadAttachments();
    }, [attachmentIds, storageAdapter]);

    if (loading) {
        return (
            <div className="flex gap-2 mb-3">
                {attachmentIds.map((id) => (
                    <div
                        key={id}
                        className="w-20 h-20 bg-muted/30 border border-border/50 animate-pulse flex items-center justify-center"
                    >
                        <ImageIcon
                            size={20}
                            className="text-muted-foreground/50"
                        />
                    </div>
                ))}
            </div>
        );
    }

    if (attachments.length === 0) {
        return null;
    }

    return (
        <div className="flex flex-wrap gap-2 mb-3">
            {attachments.map((attachment, index) => (
                <button
                    key={attachment.id}
                    onClick={() => onImageClick(attachment.id)}
                    disabled={Boolean(attachment.purgedAt) || !attachment.data}
                    className={cn(
                        "relative w-20 h-20 bg-muted/30 border border-border/50 overflow-hidden transition-colors",
                        Boolean(attachment.purgedAt) || !attachment.data
                            ? "opacity-70 cursor-not-allowed"
                            : "hover:border-primary/50 cursor-pointer",
                    )}
                >
                    {Boolean(attachment.purgedAt) || !attachment.data ? (
                        <div className="w-full h-full flex flex-col items-center justify-center gap-1 text-muted-foreground/70">
                            <ImageIcon size={18} />
                            <span className="text-[10px] uppercase tracking-wider">
                                Removed
                            </span>
                        </div>
                    ) : (
                        <img
                            src={createDataUrl(
                                attachment.data,
                                attachment.mimeType,
                            )}
                            alt={`Attachment ${index + 1}`}
                            className="w-full h-full object-cover"
                            loading="lazy"
                        />
                    )}
                </button>
            ))}
        </div>
    );
}

function MessageItem({
    message,
    index,
    sending,
    onImageClick,
}: {
    message: Message;
    index: number;
    sending?: boolean;
    onImageClick: (imageId: string) => void;
}) {
    const isUser = message.role === "user";
    const [showSkill, setShowSkill] = useState(false);

    // Use skill directly from message (already cloned)
    const skill = message.skill;

    // Check if this user message has a skill
    const isSkillMessage = isUser && skill;

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
            <div
                className={cn(
                    "flex flex-col",
                    isUser ? "items-end" : "items-start",
                )}
            >
                {/* Skill collapsible for user message with skill */}
                {isSkillMessage && skill && (
                    <details className="mb-3 inline-flex flex-col max-w-[90%] border border-primary/30 bg-primary/15">
                        <summary
                            className="flex items-center gap-2 px-4 py-2.5 cursor-pointer select-none text-primary"
                            onClick={() => setShowSkill(!showSkill)}
                        >
                            <span
                                className={cn(
                                    "font-medium text-sm",
                                    showSkill && "flex-1 text-right",
                                )}
                            >
                                {skill.name}
                            </span>
                            <Sparkles size={14} className="ml-auto" />
                            {showSkill ? (
                                <ChevronDown size={14} className="ml-2" />
                            ) : (
                                <ChevronLeft size={14} className="ml-2" />
                            )}
                        </summary>
                        <div className="px-4 pb-3 text-sm border-t border-primary/20">
                            {skill.description && (
                                <p className="text-foreground py-2">
                                    {skill.description}
                                </p>
                            )}
                            <div className="p-3 bg-muted/50 border border-border mono text-xs whitespace-pre-wrap text-foreground max-h-40 overflow-y-auto">
                                {skill.prompt}
                            </div>
                        </div>
                    </details>
                )}

                {/* Attachments - displayed before content for user messages */}
                {isUser &&
                    message.attachmentIds &&
                    message.attachmentIds.length > 0 && (
                        <div className="max-w-[90%]">
                            <MessageAttachments
                                attachmentIds={message.attachmentIds}
                                onImageClick={onImageClick}
                            />
                        </div>
                    )}

                {/* Reasoning section - collapsible, above message */}
                {message.thinking && (
                    <ReasoningSection
                        thinking={message.thinking}
                        isStreaming={sending && !message.content}
                    />
                )}

                {/* Main content - hidden while reasoning is streaming */}
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
                                // Show "Generating..." when waiting for content
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
                                    components={{
                                        a: ({
                                            children,
                                            node: _node,
                                            ref: _ref,
                                            ...props
                                        }) => (
                                            <a
                                                {...props}
                                                {...externalLinkProps}
                                            >
                                                {children}
                                            </a>
                                        ),
                                    }}
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
                    {((message.searchLevel && message.searchLevel !== "none") ||
                        (message.thinkingLevel &&
                            message.thinkingLevel !== "none") ||
                        message.modelId) && (
                        <span className="w-px h-3 bg-border" />
                    )}

                    {/* Search badge */}
                    {message.searchLevel && message.searchLevel !== "none" && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-accent/10 border border-accent/20 text-accent">
                            <Search size={10} />
                            <span className="uppercase tracking-wider font-medium">
                                Web-
                                {message.searchLevel === "low"
                                    ? "3"
                                    : message.searchLevel === "medium"
                                      ? "6"
                                      : "10"}
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
