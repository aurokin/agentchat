"use client";

import React, { useState } from "react";
import { useChat } from "@/contexts/ChatContext";
import { useSettings } from "@/contexts/SettingsContext";
import { sendMessage } from "@/lib/openrouter";
import { MessageList } from "./MessageList";
import { MessageInput } from "./MessageInput";
import { modelSupportsSearch, modelSupportsReasoning, type ThinkingLevel } from "@/lib/types";
import { Hexagon, Sparkles, AlertCircle } from "lucide-react";

export function ChatWindow() {
    const {
        currentChat,
        messages,
        addMessage,
        updateMessage,
        updateChat,
        createChat,
    } = useChat();
    const { apiKey, selectedSkill, setSelectedSkill, models } = useSettings();
    const [sending, setSending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSendMessage = async (content: string) => {
        if (!apiKey) {
            setError("Please add your OpenRouter API key in Settings");
            return;
        }

        if (!currentChat) {
            setError("No chat selected");
            return;
        }

        setSending(true);
        setError(null);

        try {
            // Get current model and check capabilities
            const currentModel = models.find(m => m.id === currentChat.modelId);
            const supportsReasoning = modelSupportsReasoning(currentModel);
            const supportsSearch = modelSupportsSearch(currentModel);

            // Only use features the model actually supports
            const effectiveThinking = supportsReasoning ? currentChat.thinking : "none";
            const effectiveSearch = supportsSearch && currentChat.searchEnabled;

            // Build context content with skill prompt if applicable
            const contextContent = selectedSkill
                ? `${selectedSkill.prompt}\n\nUser: ${content}`
                : content;

            // Clone skill object (deep copy to prevent mutations)
            const clonedSkill = selectedSkill
                ? JSON.parse(JSON.stringify(selectedSkill))
                : null;

            // Add user message with both content types and settings snapshot (only save supported features)
            await addMessage({
                role: "user",
                content: content, // Display content
                contextContent: contextContent, // API context content
                skill: clonedSkill, // Cloned skill object
                modelId: currentChat.modelId,
                thinkingLevel: effectiveThinking,
                searchEnabled: effectiveSearch,
            });

            // Build API context using contextContent from all messages
            const currentMessages = [
                ...messages.map((m) => ({
                    role: m.role,
                    content: m.contextContent,
                })),
                { role: "user", content: contextContent },
            ];

            // Create assistant message placeholder with same settings (only save supported features)
            const assistantMessage = await addMessage({
                role: "assistant",
                content: "",
                contextContent: "",
                skill: null,
                modelId: currentChat.modelId,
                thinkingLevel: effectiveThinking,
                searchEnabled: effectiveSearch,
            });

            let fullResponse = "";
            let fullThinking = "";

            // Send to API with streaming
            await sendMessage(
                apiKey,
                currentMessages,
                currentChat,
                currentModel,
                (chunk, thinking) => {
                    if (thinking !== undefined) {
                        fullThinking += thinking;
                    } else {
                        fullResponse += chunk;
                    }

                    // Update message with streaming content (content = contextContent for assistant)
                    updateMessage(assistantMessage.id, {
                        content: fullResponse,
                        contextContent: fullResponse,
                        thinking: fullThinking || undefined,
                    });
                },
            );

            // Update chat title if it's a new chat
            if (currentChat.title === "New Chat" && messages.length === 0) {
                const title =
                    content.slice(0, 50) + (content.length > 50 ? "..." : "");
                updateChat({ ...currentChat, title });
            }

            // Reset skill selection after sending
            if (selectedSkill) {
                setSelectedSkill(null);
            }
        } catch (err) {
            setError(
                err instanceof Error ? err.message : "Failed to send message",
            );
        } finally {
            setSending(false);
        }
    };

    const handleModelChange = async (modelId: string) => {
        if (!currentChat) return;
        await updateChat({ ...currentChat, modelId });
    };

    const handleThinkingChange = async (value: ThinkingLevel) => {
        if (!currentChat) return;
        await updateChat({ ...currentChat, thinking: value });
    };

    const handleSearchChange = async (enabled: boolean) => {
        if (!currentChat) return;
        await updateChat({ ...currentChat, searchEnabled: enabled });
    };

    if (!currentChat) {
        return (
            <div className="flex-1 flex flex-col h-screen bg-background relative overflow-hidden">
                {/* Decorative elements */}
                <div className="absolute inset-0 pointer-events-none">
                    {/* Subtle radial gradient */}
                    <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-radial from-primary/5 via-transparent to-transparent" />
                    {/* Corner decorations */}
                    <div className="absolute top-8 left-8 w-24 h-24 border-l border-t border-primary/20" />
                    <div className="absolute bottom-8 right-8 w-24 h-24 border-r border-b border-primary/20" />
                    {/* Grid pattern */}
                    <div className="absolute inset-0 opacity-[0.02]" style={{
                        backgroundImage: 'linear-gradient(var(--primary) 1px, transparent 1px), linear-gradient(90deg, var(--primary) 1px, transparent 1px)',
                        backgroundSize: '60px 60px'
                    }} />
                </div>

                <div className="flex-1 flex items-center justify-center relative z-10">
                    <div className="text-center max-w-lg px-6">
                        {/* Logo */}
                        <div className="relative inline-block mb-8">
                            <Hexagon
                                size={80}
                                className="text-primary"
                                strokeWidth={1}
                            />
                            <span className="absolute inset-0 flex items-center justify-center text-2xl font-semibold text-primary">
                                R
                            </span>
                        </div>

                        <h2 className="text-4xl font-light mb-3 tracking-tight">
                            Welcome to{" "}
                            <span className="font-semibold text-gradient-gold">
                                RouterChat
                            </span>
                        </h2>
                        <p className="text-foreground-muted text-lg mb-8">
                            Your gateway to AI-powered conversations
                        </p>

                        <button
                            onClick={() => createChat()}
                            className="btn-deco btn-deco-primary text-base px-8 py-3"
                        >
                            <Sparkles size={18} />
                            <span>Start New Conversation</span>
                        </button>

                        <p className="mt-6 text-sm text-muted-foreground">
                            Or select an existing conversation from the sidebar
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col h-screen bg-background relative overflow-hidden">
            {/* Decorative top line */}
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />

            {/* Error message - floats at top if present */}
            {error && (
                <div className="px-6 py-3 bg-error/5 border-b border-error/20 flex items-center gap-3 relative z-20">
                    <AlertCircle size={16} className="text-error flex-shrink-0" />
                    <p className="text-error text-sm">{error}</p>
                </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto relative z-10">
                <MessageList messages={messages} sending={sending} />
            </div>

            {/* Unified input bar with all controls */}
            <div className="border-t border-border p-4 bg-background-elevated/30 relative z-10">
                <MessageInput
                    onSend={handleSendMessage}
                    disabled={sending}
                    selectedModel={currentChat.modelId}
                    onModelChange={handleModelChange}
                    thinkingLevel={currentChat.thinking}
                    onThinkingChange={handleThinkingChange}
                    reasoningSupported={modelSupportsReasoning(models.find(m => m.id === currentChat.modelId))}
                    searchEnabled={currentChat.searchEnabled}
                    onSearchChange={handleSearchChange}
                    searchSupported={modelSupportsSearch(models.find(m => m.id === currentChat.modelId))}
                />
            </div>
        </div>
    );
}
