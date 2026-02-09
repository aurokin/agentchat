"use client";

import React, {
    useState,
    useRef,
    useEffect,
    forwardRef,
    useCallback,
} from "react";
import { Send } from "lucide-react";
import { cn, generateUUID } from "@/lib/utils";
import { useStorageAdapter } from "@/contexts/SyncContext";
import { ModelSelector } from "./ModelSelector";
import { SkillSelector } from "./SkillSelector";
import { ThinkingToggle } from "./ThinkingToggle";
import { SearchToggle } from "./SearchToggle";
import { AttachmentButton } from "./AttachmentButton";
import { AttachmentPreview } from "./AttachmentPreview";
import { StorageErrorModal } from "./StorageErrorModal";
import { KeybindingsHelp } from "@/components/keybindings/KeybindingsHelp";
import type {
    ThinkingLevel,
    SearchLevel,
    PendingAttachment,
} from "@/lib/types";
import {
    processImage,
    generateThumbnail,
    createDataUrl,
} from "@/lib/imageProcessing";
import {
    hasImageInClipboardEvent,
    readImageFromClipboardEvent,
} from "@/lib/clipboard";
import {
    CLOUD_IMAGE_QUOTA,
    LOCAL_IMAGE_QUOTA,
    MAX_SESSION_STORAGE,
} from "@shared/core/quota";
import { ConvexStorageAdapter } from "@/lib/sync/convex-adapter";

interface MessageInputProps {
    onSend: (content: string, attachments?: PendingAttachment[]) => void;
    disabled?: boolean;
    canSend?: boolean;
    selectedModel: string;
    onModelChange: (modelId: string) => void;
    thinkingLevel: ThinkingLevel;
    onThinkingChange: (value: ThinkingLevel) => void;
    reasoningSupported?: boolean;
    searchLevel: SearchLevel;
    onSearchChange: (level: SearchLevel) => void;
    searchSupported?: boolean;
    visionSupported?: boolean;
    sessionId?: string;
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
            searchLevel,
            onSearchChange,
            searchSupported = true,
            visionSupported = false,
            sessionId,
        } = props;

        const storageAdapter = useStorageAdapter();
        const [content, setContent] = useState("");
        const [pendingAttachments, setPendingAttachments] = useState<
            PendingAttachment[]
        >([]);
        const [processingCount, setProcessingCount] = useState(0);
        const [modalError, setModalError] = useState<{
            title: string;
            message: string;
        } | null>(null);

        const textareaRef = useRef<HTMLTextAreaElement>(null);
        const actualRef =
            (ref as React.RefObject<HTMLTextAreaElement>) || textareaRef;

        const canSubmit =
            (content.trim() || pendingAttachments.length > 0) && canSend;

        const handleSubmit = (e: React.FormEvent) => {
            e.preventDefault();
            if (canSubmit) {
                onSend(
                    content.trim(),
                    pendingAttachments.length > 0
                        ? pendingAttachments
                        : undefined,
                );
                setContent("");
                setPendingAttachments([]);
            }
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
                if (canSubmit) {
                    onSend(
                        content.trim(),
                        pendingAttachments.length > 0
                            ? pendingAttachments
                            : undefined,
                    );
                    setContent("");
                    setPendingAttachments([]);
                }
            }
        };

        // Check storage limits before allowing attachment
        const checkStorageLimits = useCallback(async (): Promise<{
            allowed: boolean;
            error?: string;
        }> => {
            try {
                const isCloudStorage =
                    storageAdapter instanceof ConvexStorageAdapter;
                const totalLimit = isCloudStorage
                    ? CLOUD_IMAGE_QUOTA
                    : LOCAL_IMAGE_QUOTA;

                const usage = await storageAdapter.getStorageUsage();
                if (usage.bytes >= totalLimit) {
                    return {
                        allowed: false,
                        error: isCloudStorage
                            ? "Cloud storage limit reached. Delete old conversations or remove cloud images to free up space."
                            : "Storage limit reached. Delete old conversations to free up space.",
                    };
                }

                // Per-conversation image limits are a local-storage guardrail. Cloud storage has
                // its own server-side limits, and checking per-chat usage would require
                // downloading or querying a lot of metadata.
                if (!isCloudStorage && sessionId) {
                    const sessionMessages =
                        await storageAdapter.getMessagesByChat(sessionId);
                    let sessionUsage = 0;

                    for (const message of sessionMessages) {
                        if (message.attachmentIds?.length) {
                            const attachments =
                                await storageAdapter.getAttachmentsByMessage(
                                    message.id,
                                );
                            sessionUsage += attachments.reduce(
                                (sum, attachment) => sum + attachment.size,
                                0,
                            );
                        }
                    }

                    if (sessionUsage >= MAX_SESSION_STORAGE) {
                        return {
                            allowed: false,
                            error: "This conversation has reached its image limit. Start a new conversation to add more images.",
                        };
                    }
                }

                return { allowed: true };
            } catch {
                // If storage check fails, allow the attachment attempt
                return { allowed: true };
            }
        }, [sessionId, storageAdapter]);

        // Process files and add as pending attachments
        const processFiles = useCallback(
            async (files: File[]) => {
                const { allowed, error } = await checkStorageLimits();
                if (!allowed) {
                    setModalError({
                        title: "Storage Limit Reached",
                        message: error || "Storage limit reached",
                    });
                    return;
                }

                setProcessingCount((prev) => prev + files.length);

                for (const file of files) {
                    try {
                        const processed = await processImage(file);
                        const dataUrl = createDataUrl(
                            processed.data,
                            processed.mimeType,
                        );
                        const thumbnail = await generateThumbnail(dataUrl);

                        const attachment: PendingAttachment = {
                            id: generateUUID(),
                            type: "image",
                            mimeType: processed.mimeType,
                            data: processed.data,
                            width: processed.width,
                            height: processed.height,
                            size: processed.size,
                            preview: thumbnail,
                        };

                        setPendingAttachments((prev) => [...prev, attachment]);
                    } catch (err) {
                        console.error("Failed to process image:", err);
                        const message =
                            err instanceof Error
                                ? err.message
                                : "Failed to process image";
                        setModalError({
                            title: "Couldn't Add Image",
                            message,
                        });
                    } finally {
                        setProcessingCount((prev) => prev - 1);
                    }
                }
            },
            [checkStorageLimits],
        );

        const handleFileSelect = useCallback(
            (files: File[]) => {
                processFiles(files);
            },
            [processFiles],
        );

        const handleRemoveAttachment = useCallback((id: string) => {
            setPendingAttachments((prev) => prev.filter((a) => a.id !== id));
        }, []);

        const handlePaste = useCallback(
            (e: React.ClipboardEvent) => {
                if (!visionSupported) return;

                const clipboardEvent = e.nativeEvent;
                if (hasImageInClipboardEvent(clipboardEvent)) {
                    e.preventDefault();
                    const image = readImageFromClipboardEvent(clipboardEvent);
                    if (image) {
                        processFiles([
                            new File([image.blob], "pasted-image", {
                                type: image.mimeType,
                            }),
                        ]);
                    }
                }
            },
            [visionSupported, processFiles],
        );

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
            <>
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
                            <SearchToggle
                                value={searchLevel}
                                onChange={onSearchChange}
                                disabled={disabled || !searchSupported}
                            />
                            {reasoningSupported && (
                                <ThinkingToggle
                                    value={thinkingLevel}
                                    onChange={onThinkingChange}
                                    disabled={disabled}
                                />
                            )}
                        </div>
                        <AttachmentPreview
                            attachments={pendingAttachments}
                            processingCount={processingCount}
                            onRemove={handleRemoveAttachment}
                            disabled={disabled}
                        />
                        <div className="relative">
                            <textarea
                                ref={actualRef}
                                value={content}
                                onChange={(e) => setContent(e.target.value)}
                                onKeyDown={handleKeyDown}
                                onPaste={handlePaste}
                                placeholder="Send a message..."
                                className={cn(
                                    "w-full px-4 py-3.5 bg-transparent text-foreground resize-none",
                                    "placeholder:text-muted-foreground",
                                    visionSupported ? "pr-32" : "pr-20",
                                )}
                                style={{ outline: "none", boxShadow: "none" }}
                                rows={1}
                            />
                            <div className="absolute right-3 bottom-3 flex items-center gap-1">
                                {visionSupported && (
                                    <AttachmentButton
                                        onAttach={handleFileSelect}
                                        disabled={disabled}
                                    />
                                )}
                                <KeybindingsHelp />
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
                                    <Send
                                        size={16}
                                        className={cn(
                                            "transition-transform",
                                            canSubmit &&
                                                "group-hover/input:translate-x-0.5",
                                        )}
                                    />
                                </button>
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center justify-between mt-2 px-1 text-xs text-muted-foreground opacity-60">
                        <span>Shift + Enter or Ctrl + J for new line</span>
                        <span className={!canSend ? "text-amber-600/70" : ""}>
                            {!canSend
                                ? "Sending... (Enter disabled)"
                                : "Enter to send"}
                        </span>
                    </div>
                </form>
                <StorageErrorModal
                    title={modalError?.title}
                    message={modalError?.message ?? null}
                    onDismiss={() => setModalError(null)}
                />
            </>
        );
    },
);

MessageInput.displayName = "MessageInput";
