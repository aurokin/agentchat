"use client";

import {
    useRef,
    useEffect,
    useCallback,
    useMemo,
    startTransition,
} from "react";
import { useRouter } from "next/navigation";
import { api } from "@convex/_generated/api";
import type { FunctionReference } from "convex/server";
import { useChat } from "@/contexts/ChatContext";
import { useAgent } from "@/contexts/AgentContext";
import { useSettings } from "@/contexts/SettingsContext";
import { getSharedAgentchatSocketClient } from "@/lib/agentchat-socket";
import { useActionSafe } from "@/hooks/useConvexSafe";
import { MessageList } from "./MessageList";
import { MessageInput } from "./MessageInput";
import { useConversationRuntime } from "./useConversationRuntime";
import { resolveDisplayedRuntimeState } from "./conversation-runtime-display";
import { modelSupportsReasoning, type ChatRunSummary } from "@/lib/types";
import { APP_DEFAULT_MODEL } from "@shared/core/models";
import { resolveChatSettingsAgainstModels } from "@shared/core/defaults";
import { Hexagon, Sparkles, AlertCircle, RefreshCw } from "lucide-react";

const convexApi = api as typeof api & {
    backendTokens: {
        issue: FunctionReference<"action">;
    };
};

const isKeybindingBlocked = () => {
    if (typeof document === "undefined") return false;
    return Boolean(
        document.querySelector(
            "[data-keybinding-scope='modal'][data-keybinding-open='true'], [data-keybinding-scope='dropdown'][data-keybinding-open='true']",
        ),
    );
};

const isTypingTarget = (target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return false;
    if (target.isContentEditable) return true;
    const tag = target.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
};

const getDigitFromEvent = (event: KeyboardEvent): number | null => {
    const code = event.code.toLowerCase();
    if (code.startsWith("digit")) {
        return Number.parseInt(code.replace("digit", ""), 10);
    }
    if (code.startsWith("numpad")) {
        return Number.parseInt(code.replace("numpad", ""), 10);
    }

    const parsed = Number.parseInt(event.key, 10);
    if (!Number.isNaN(parsed)) {
        return parsed;
    }

    const hasAlt =
        event.altKey ||
        event.getModifierState("Alt") ||
        event.getModifierState("AltGraph");
    if (!hasAlt) {
        return null;
    }

    const optionDigitMap: Record<string, number> = {
        "¡": 1,
        "™": 2,
        "£": 3,
        "¢": 4,
        "∞": 5,
        "§": 6,
        "¶": 7,
        "•": 8,
        ª: 9,
        º: 0,
    };

    return optionDigitMap[event.key] ?? null;
};

export function ChatWindow() {
    const router = useRouter();
    const {
        currentChat,
        messages,
        runSummaries,
        runtimeState,
        isMessagesLoading,
        addMessage,
        insertMessage,
        updateMessage,
        patchMessage,
        updateChat,
        createChat,
    } = useChat();
    const { agents, selectedAgent } = useAgent();
    const { models, favoriteModels } = useSettings();
    const issueBackendSessionToken = useActionSafe(
        convexApi.backendTokens.issue,
    );
    const socketClient = useMemo(() => getSharedAgentchatSocketClient(), []);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    const getBackendSessionToken = useCallback(async () => {
        const result = await issueBackendSessionToken({});
        if (!result || typeof result.token !== "string") {
            throw new Error(
                "Unable to create an authenticated Agentchat server session.",
            );
        }

        return result.token;
    }, [issueBackendSessionToken]);

    const runSummariesByMessageId = useMemo(() => {
        const byMessageId = new Map<string, ChatRunSummary>();
        for (const runSummary of runSummaries) {
            if (runSummary.outputMessageLocalId) {
                byMessageId.set(runSummary.outputMessageLocalId, runSummary);
            }
        }
        return byMessageId;
    }, [runSummaries]);

    useEffect(() => {
        if (!currentChat || isMessagesLoading) return;

        const messagesMatchChat =
            messages.length === 0 ||
            messages.every((message) => message.sessionId === currentChat.id);
        if (!messagesMatchChat) return;

        const resolvedSettings = resolveChatSettingsAgainstModels({
            current: {
                modelId: currentChat.modelId,
                variantId: currentChat.variantId ?? null,
            },
            defaults: {
                modelId: selectedAgent?.defaultModel ?? APP_DEFAULT_MODEL,
                variantId: selectedAgent?.defaultVariant ?? null,
            },
            models,
        });

        if (
            resolvedSettings.modelId !== currentChat.modelId ||
            (resolvedSettings.variantId ?? null) !==
                (currentChat.variantId ?? null)
        ) {
            void updateChat({
                ...currentChat,
                modelId: resolvedSettings.modelId,
                variantId: resolvedSettings.variantId ?? null,
            });
        }
    }, [
        currentChat,
        isMessagesLoading,
        messages,
        models,
        selectedAgent?.defaultModel,
        selectedAgent?.defaultVariant,
        updateChat,
    ]);

    const {
        displayedMessages,
        sending,
        error,
        recoveredRunNotice,
        handleSendMessage,
        handleCancel,
        handleRetry,
    } = useConversationRuntime({
        currentChat,
        messages,
        isMessagesLoading,
        runtimeState,
        models,
        socketClient,
        getBackendSessionToken,
        addMessage,
        insertMessage,
        updateMessage,
        patchMessage,
        updateChat,
    });

    const effectiveRuntimeState = useMemo(
        () =>
            resolveDisplayedRuntimeState({
                runtimeState,
                recoveredRunNotice,
            }),
        [recoveredRunNotice, runtimeState],
    );

    useEffect(() => {
        if (currentChat && inputRef.current) {
            inputRef.current.focus();
        }
    }, [currentChat]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (isKeybindingBlocked()) return;

            const key = event.key.toLowerCase();
            const code = event.code.toLowerCase();
            const hasModifier =
                event.ctrlKey ||
                event.metaKey ||
                event.getModifierState("Control") ||
                event.getModifierState("Meta");
            const hasAlt =
                event.altKey ||
                event.getModifierState("Alt") ||
                event.getModifierState("AltGraph");

            if (!hasModifier && !event.shiftKey && !hasAlt && key === "/") {
                if (isTypingTarget(event.target)) return;
                event.preventDefault();
                inputRef.current?.focus();
                return;
            }

            if (hasModifier && !event.shiftKey && !hasAlt && key === ",") {
                event.preventDefault();
                startTransition(() => {
                    router.push("/settings");
                });
                return;
            }

            if (!currentChat) return;
            const settingsLocked = currentChat.settingsLockedAt != null;

            if (
                !settingsLocked &&
                hasModifier &&
                hasAlt &&
                !event.shiftKey &&
                code === "keym"
            ) {
                const availableFavorites = favoriteModels.filter((modelId) =>
                    models.some((model) => model.id === modelId),
                );
                if (availableFavorites.length === 0) return;

                const currentIndex = availableFavorites.indexOf(
                    currentChat.modelId,
                );
                const nextIndex =
                    currentIndex === -1
                        ? 0
                        : (currentIndex + 1) % availableFavorites.length;
                const nextModelId = availableFavorites[nextIndex];
                if (nextModelId && nextModelId !== currentChat.modelId) {
                    event.preventDefault();
                    const nextModel = models.find(
                        (model) => model.id === nextModelId,
                    );
                    const nextVariantId = nextModel?.variants?.some(
                        (variant) => variant.id === currentChat.variantId,
                    )
                        ? (currentChat.variantId ?? null)
                        : (nextModel?.variants?.[0]?.id ?? null);
                    void updateChat({
                        ...currentChat,
                        modelId: nextModelId,
                        variantId: nextVariantId,
                    });
                }
                return;
            }
        };

        window.addEventListener("keydown", handleKeyDown, true);
        return () => window.removeEventListener("keydown", handleKeyDown, true);
    }, [currentChat, favoriteModels, models, router, updateChat]);

    const handleModelChange = async (modelId: string) => {
        if (!currentChat) return;
        if (currentChat.settingsLockedAt != null) return;

        const nextModel = models.find((model) => model.id === modelId);
        const nextVariantId = nextModel?.variants?.some(
            (variant) => variant.id === currentChat.variantId,
        )
            ? (currentChat.variantId ?? null)
            : (nextModel?.variants?.[0]?.id ?? null);
        await updateChat({
            ...currentChat,
            modelId,
            variantId: nextVariantId,
        });
    };

    const handleVariantChange = async (variantId: string) => {
        if (!currentChat) return;
        if (currentChat.settingsLockedAt != null) return;
        if (currentChat.variantId === variantId) return;

        await updateChat({
            ...currentChat,
            variantId,
        });
    };

    const selectedModelDefinition = useMemo(
        () => models.find((model) => model.id === currentChat?.modelId) ?? null,
        [currentChat?.modelId, models],
    );

    if (!currentChat) {
        return (
            <div className="flex-1 flex flex-col h-full bg-background relative overflow-hidden">
                <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-radial from-primary/5 via-transparent to-transparent" />
                    <div className="absolute top-8 left-8 w-24 h-24 border-l border-t border-primary/20" />
                    <div className="absolute bottom-8 right-8 w-24 h-24 border-r border-b border-primary/20" />
                    <div
                        className="absolute inset-0 opacity-[0.02]"
                        style={{
                            backgroundImage:
                                "linear-gradient(var(--primary) 1px, transparent 1px), linear-gradient(90deg, var(--primary) 1px, transparent 1px)",
                            backgroundSize: "60px 60px",
                        }}
                    />
                </div>

                <div className="flex-1 flex items-center justify-center relative z-10">
                    <div className="text-center max-w-lg px-6">
                        <div className="relative inline-block mb-8">
                            <Hexagon
                                size={80}
                                className="text-primary"
                                strokeWidth={1}
                            />
                            <span className="absolute inset-0 flex items-center justify-center text-2xl font-semibold text-primary">
                                A
                            </span>
                        </div>

                        <h2 className="text-4xl font-light mb-3 tracking-tight">
                            Welcome to{" "}
                            <span className="font-semibold text-gradient-primary">
                                Agentchat
                            </span>
                        </h2>
                        <p className="text-foreground-muted text-lg mb-8">
                            {agents.length === 0
                                ? "Configure an agent on the server to begin."
                                : selectedAgent
                                  ? `Conversations for ${selectedAgent.name} stay isolated from your other agents.`
                                  : "Choose an agent in the sidebar to load its conversations."}
                        </p>

                        <button
                            onClick={() => createChat()}
                            disabled={!selectedAgent}
                            className="btn-deco btn-deco-primary text-base px-8 py-3 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            <Sparkles size={18} />
                            <span>
                                {selectedAgent
                                    ? `Start ${selectedAgent.name} Conversation`
                                    : "Select an Agent First"}
                            </span>
                        </button>

                        <p className="mt-6 text-sm text-muted-foreground">
                            {selectedAgent
                                ? "Or select an existing conversation from the sidebar"
                                : "Existing conversations appear after you choose an agent"}
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col h-full bg-background relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />

            {error && (
                <div
                    className="px-6 py-3 bg-error/5 border-b border-error/20 flex items-center gap-3 relative z-20"
                    data-testid="runtime-error-banner"
                >
                    <AlertCircle
                        size={16}
                        className="text-error flex-shrink-0"
                    />
                    <p className="text-error text-sm flex-1">{error.message}</p>
                    {error.isRetryable && (
                        <button
                            onClick={handleRetry}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-error/10 hover:bg-error/20 text-error rounded-md transition-colors cursor-pointer"
                            disabled={sending}
                        >
                            <RefreshCw
                                size={12}
                                className={sending ? "animate-spin" : ""}
                            />
                            Retry
                        </button>
                    )}
                </div>
            )}

            {!error && effectiveRuntimeState.phase === "recovering" && (
                <div
                    className="px-6 py-3 bg-primary/5 border-b border-primary/20 flex items-center gap-3 relative z-20"
                    data-testid="runtime-recovering-banner"
                >
                    <RefreshCw
                        size={16}
                        className="text-primary flex-shrink-0"
                    />
                    <p className="text-sm text-primary">
                        Reconnected to the active run for this conversation.
                    </p>
                </div>
            )}

            {!error && effectiveRuntimeState.phase === "failed" && (
                <div
                    className="px-6 py-3 bg-error/5 border-b border-error/20 flex items-center gap-3 relative z-20"
                    data-testid="runtime-failed-banner"
                >
                    <AlertCircle
                        size={16}
                        className="text-error flex-shrink-0"
                    />
                    <p className="text-sm text-error">
                        {effectiveRuntimeState.errorMessage ??
                            "The last run for this conversation failed."}
                    </p>
                </div>
            )}

            {!error && effectiveRuntimeState.phase === "interrupted" && (
                <div
                    className="px-6 py-3 bg-warning/5 border-b border-warning/20 flex items-center gap-3 relative z-20"
                    data-testid="runtime-interrupted-banner"
                >
                    <AlertCircle
                        size={16}
                        className="text-warning flex-shrink-0"
                    />
                    <p className="text-sm text-warning">
                        The last run for this conversation was interrupted.
                    </p>
                </div>
            )}

            <div className="flex-1 overflow-y-auto relative z-10">
                <MessageList
                    messages={displayedMessages}
                    sending={sending}
                    runSummariesByMessageId={runSummariesByMessageId}
                />
            </div>

            <div className="border-t border-border p-4 bg-background-elevated/30 relative z-10">
                <MessageInput
                    ref={inputRef}
                    onSend={handleSendMessage}
                    onCancel={handleCancel}
                    disabled={false}
                    canSend={!sending}
                    isSending={sending}
                    settingsLocked={currentChat.settingsLockedAt != null}
                    selectedModel={currentChat.modelId}
                    onModelChange={handleModelChange}
                    variants={selectedModelDefinition?.variants ?? []}
                    selectedVariantId={currentChat.variantId ?? null}
                    onVariantChange={handleVariantChange}
                />
            </div>
        </div>
    );
}
