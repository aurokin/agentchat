"use client";

import React, { useState } from "react";
import { useChat } from "@/contexts/ChatContext";
import { useSettings } from "@/contexts/SettingsContext";
import { sendMessage } from "@/lib/openrouter";
import { MessageList } from "./MessageList";
import { MessageInput } from "./MessageInput";
import { ModelSelector } from "./ModelSelector";
import { SkillSelector } from "./SkillSelector";
import type { ThinkingLevel } from "@/lib/types";
import { ThinkingToggle } from "./ThinkingToggle";
import { SearchToggle } from "./SearchToggle";
import { Terminal, Cpu } from "lucide-react";

export function ChatWindow() {
    const { currentChat, messages, addMessage, updateMessage, updateChat, createChat } = useChat();
    const { apiKey, selectedSkill, setSelectedSkill } = useSettings();
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
            // Prepend skill prompt if skill is selected
            const fullContent = selectedSkill
                ? `${selectedSkill.prompt}\n\nUser: ${content}`
                : content;

            // Add user message
            await addMessage({
                role: "user",
                content: fullContent,
                skillId: selectedSkill?.id,
            });

            // Get current messages for API
            const currentMessages = [...messages, { role: "user", content: fullContent }];

            // Create assistant message placeholder
            const assistantMessage = await addMessage({
                role: "assistant",
                content: "",
            });

            let fullResponse = "";
            let fullThinking = "";

            // Send to API with streaming
            await sendMessage(
                apiKey,
                currentMessages,
                currentChat,
                (chunk, thinking) => {
                    if (thinking !== undefined) {
                        fullThinking += thinking;
                    } else {
                        fullResponse += chunk;
                    }

                    // Update message with streaming content
                    updateMessage(assistantMessage.id, {
                        content: fullResponse,
                        thinking: fullThinking || undefined,
                    });
                }
            );

            // Update chat title if it's a new chat
            if (currentChat.title === "New Chat" && messages.length === 0) {
                const title = content.slice(0, 50) + (content.length > 50 ? "..." : "");
                updateChat({ ...currentChat, title });
            }

            // Reset skill selection after sending
            if (selectedSkill) {
                setSelectedSkill(null);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to send message");
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
            <div className="flex-1 flex flex-col h-screen bg-background relative">
                {/* Decorative background */}
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
                    <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-secondary/5 rounded-full blur-3xl" />
                </div>

                <div className="flex-1 flex items-center justify-center relative z-10">
                    <div className="text-center max-w-md">
                        <div className="inline-flex items-center justify-center w-20 h-20 bg-primary mb-6 shadow-brutal">
                            <Terminal size={40} className="text-primary-foreground" />
                        </div>
                        <h2 className="text-3xl font-bold mb-3">
                            Welcome to <span className="text-gradient">OpenChat</span>
                        </h2>
                        <p className="text-muted-foreground mono text-sm mb-6">
              // Select a chat from the sidebar<br />or start a new conversation
                        </p>
                        <button
                            onClick={() => createChat()}
                            className="btn-brutal btn-brutal-primary"
                        >
                            <Cpu size={18} />
                            <span className="mono">START_NEW_CHAT</span>
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col h-screen bg-background relative">
            {/* Decorative background */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-0 left-1/4 w-full h-px bg-gradient-to-r from-transparent via-primary/10 to-transparent" />
            </div>

            {/* Header */}
            <header className="px-6 py-4 border-b-2 border-border flex items-center justify-between gap-4 relative z-50">
                <div className="flex items-center gap-4 flex-1">
                    <div className="flex items-center gap-2 text-sm mono text-muted-foreground">
                        <span className="text-primary">_</span>
                        <span>MODEL</span>
                    </div>
                    <ModelSelector
                        selectedModel={currentChat.modelId}
                        onModelChange={handleModelChange}
                    />
                </div>

                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-2 text-sm mono text-muted-foreground mr-2">
                        <span className="text-primary">_</span>
                        <span className="hidden sm:inline">SKILL</span>
                    </div>
                    <SkillSelector disabled={sending} />
                    <ThinkingToggle
                        value={currentChat.thinking}
                        onChange={handleThinkingChange}
                        disabled={sending}
                    />
                    <SearchToggle
                        enabled={currentChat.searchEnabled}
                        onChange={handleSearchChange}
                        disabled={sending}
                    />
                </div>
            </header>

            {/* Error message */}
            {error && (
                <div className="px-6 py-3 bg-error/10 border-b border-error/30">
                    <p className="text-error mono text-sm">
                        <span className="font-bold">ERROR:</span> {error}
                    </p>
                </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto relative z-10">
                <MessageList messages={messages} sending={sending} />
            </div>

            {/* Input */}
            <div className="border-t-2 border-border p-4 relative z-10">
                <MessageInput onSend={handleSendMessage} disabled={sending} />
            </div>
        </div>
    );
}
