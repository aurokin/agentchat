"use client";

import React from "react";
import type { Message } from "@/lib/types";
import { format } from "date-fns";
import { User, Bot, Brain, Terminal } from "lucide-react";
import { cn } from "@/lib/utils";

interface MessageListProps {
  messages: Message[];
  sending?: boolean;
}

export function MessageList({ messages, sending }: MessageListProps) {
  if (messages.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-muted mb-4 border-2 border-border">
            <Terminal size={28} className="text-muted-foreground" />
          </div>
          <p className="text-muted-foreground mono text-sm">
            // No messages yet.<br />Start a conversation!
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {messages.map((message, index) => (
        <MessageItem key={message.id} message={message} index={index} />
      ))}

      {/* Typing indicator */}
      {sending && (
        <div className="flex gap-4 animate-slide-in">
          <div className="w-10 h-10 rounded-none flex items-center justify-center flex-shrink-0 bg-secondary border-2 border-border">
            <Bot size={20} className="text-secondary-foreground" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <span className="font-medium text-sm">Assistant</span>
              <span className="mono text-xs text-muted-foreground">
                // thinking
              </span>
            </div>
            <div className="flex gap-1">
              <span className="typing-dot w-2 h-2 bg-secondary rounded-sm" />
              <span className="typing-dot w-2 h-2 bg-secondary rounded-sm" />
              <span className="typing-dot w-2 h-2 bg-secondary rounded-sm" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MessageItem({ message, index }: { message: Message; index: number }) {
  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";

  return (
    <div
      className={cn(
        "flex gap-4 animate-slide-in",
        isUser ? "flex-row-reverse" : "flex-row"
      )}
      style={{ animationDelay: `${index * 50}ms` }}
    >
      {/* Avatar */}
      <div
        className={cn(
          "w-10 h-10 rounded-none flex items-center justify-center flex-shrink-0 border-2",
          isUser
            ? "bg-primary border-primary"
            : "bg-secondary border-border"
        )}
      >
        {isUser ? (
          <User size={20} className="text-primary-foreground" />
        ) : (
          <Bot size={20} className="text-secondary-foreground" />
        )}
      </div>

      <div
        className={cn(
          "flex-1 min-w-0",
          isUser ? "text-right" : "text-left"
        )}
      >
        {/* Role label */}
        <div className="flex items-center gap-2 mb-2">
          <span className={cn(
            "font-medium text-sm",
            isUser ? "text-primary" : "text-secondary"
          )}>
            {isUser ? "You" : "Assistant"}
          </span>
          <span className="mono text-xs text-muted-foreground">
            // {isUser ? "USER" : "AI"}
          </span>
        </div>

        <div className="inline-block max-w-[85%]">
          {/* Thinking content */}
          {message.thinking && (
            <div className="mb-3 p-3 bg-warning/10 border-l-4 border-warning">
              <div className="flex items-center gap-2 text-warning mb-1">
                <Brain size={14} className="mono" />
                <span className="mono text-xs font-bold">THINKING</span>
              </div>
              <p className="text-warning/80 text-sm whitespace-pre-wrap font-mono">
                {message.thinking}
              </p>
            </div>
          )}

          {/* Main content */}
          <div
            className={cn(
              "p-4 whitespace-pre-wrap border-2",
              isUser
                ? "bg-primary/10 border-primary/30 text-foreground"
                : "bg-muted border-border text-foreground"
            )}
          >
            {message.content || (
              <span className="text-muted-foreground mono italic">...</span>
            )}
          </div>

          {/* Timestamp */}
          <p className="mono text-xs text-muted-foreground mt-2">
            {format(message.createdAt, "HH:mm:ss")}
          </p>
        </div>
      </div>
    </div>
  );
}
