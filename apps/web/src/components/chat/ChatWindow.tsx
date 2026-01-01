"use client";

import React, { useState, useRef, useEffect } from "react";
import { useChat } from "@/contexts/ChatContext";
import { useSettings } from "@/contexts/SettingsContext";
import { sendMessage, fetchModels } from "@/lib/openrouter";
import { MessageList } from "./MessageList";
import { MessageInput } from "./MessageInput";
import { ModelSelector } from "./ModelSelector";
import { ThinkingToggle } from "./ThinkingToggle";
import { SearchToggle } from "./SearchToggle";
import { Brain, Globe, RefreshCw } from "lucide-react";

export function ChatWindow() {
  const { currentChat, messages, addMessage, updateChat, createChat } = useChat();
  const { apiKey } = useSettings();
  const [models, setModels] = useState<Array<{ id: string; name: string }>>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load models when chat is selected
  useEffect(() => {
    const loadModels = async () => {
      if (!apiKey) return;
      setLoadingModels(true);
      try {
        const fetchedModels = await fetchModels(apiKey);
        setModels(fetchedModels);
      } catch (err) {
        console.error("Failed to load models:", err);
      } finally {
        setLoadingModels(false);
      }
    };

    loadModels();
  }, [apiKey]);

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
      // Add user message
      await addMessage({
        role: "user",
        content,
      });

      // Get current messages for API
      const currentMessages = [...messages, { role: "user", content }];

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
          addMessage({
            role: "assistant",
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

  const handleThinkingChange = async (enabled: boolean) => {
    if (!currentChat) return;
    await updateChat({ ...currentChat, thinkingEnabled: enabled });
  };

  const handleSearchChange = async (enabled: boolean) => {
    if (!currentChat) return;
    await updateChat({ ...currentChat, searchEnabled: enabled });
  };

  if (!currentChat) {
    return (
      <div className="flex-1 flex items-center justify-center bg-white">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">Welcome to OpenRouter Chat</h2>
          <p className="text-gray-600 mb-4">
            Select a chat from the sidebar or start a new one
          </p>
          <button
            onClick={() => createChat()}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Start New Chat
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-screen bg-white">
      {/* Header */}
      <header className="px-4 py-3 border-b border-gray-200 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 flex-1">
          <ModelSelector
            models={models}
            selectedModel={currentChat.modelId}
            onModelChange={handleModelChange}
            loading={loadingModels}
          />
        </div>

        <div className="flex items-center gap-2">
          <ThinkingToggle
            enabled={currentChat.thinkingEnabled}
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
        <div className="px-4 py-2 bg-red-50 text-red-600 text-sm">
          {error}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        <MessageList messages={messages} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-200 p-4">
        <MessageInput onSend={handleSendMessage} disabled={sending} />
      </div>
    </div>
  );
}
