"use client";

import React, { useRef, useEffect, useState } from "react";
import type { Message } from "@/lib/types";
import { format } from "date-fns";
import ReactMarkdown from "react-markdown";
import { User, Bot, Brain, Terminal, Copy, Check, Sparkles, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSettings } from "@/contexts/SettingsContext";

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
        <MessageItem key={message.id} message={message} index={index} sending={sending && index === messages.length} />
      ))}

      {/* Auto-scroll anchor */}
      <div ref={bottomRef} />
    </div>
  );
}

function MessageItem({ message, index, sending }: { message: Message; index: number; sending?: boolean }) {
  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";
  const [copied, setCopied] = useState(false);
  const [showSkill, setShowSkill] = useState(false);
  const { skills } = useSettings();

  const copyToClipboard = async () => {
    if (!navigator.clipboard) {
      return;
    }
    await navigator.clipboard.writeText(message.content || "");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Find the skill if this message has a skillId
  const skill = message.skillId ? skills.find((s) => s.id === message.skillId) : null;

  // Check if this is the first user message with a skill
  const isFirstSkillMessage = isUser && skill && index === 0;

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
        <div className={cn("flex items-center gap-2 mb-2", isUser ? "justify-end" : "justify-start")}>
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

        <div className="inline-block max-w-[85%] relative group">
          {/* Copy button */}
          {message.content && navigator.clipboard && (
            <button
              onClick={copyToClipboard}
              className="absolute top-2 right-2 p-1.5 rounded-md bg-background/80 border border-border opacity-0 group-hover:opacity-100 transition-opacity hover:bg-muted z-10"
              title="Copy to clipboard"
            >
              {copied ? (
                <Check size={14} className="text-green-500" />
              ) : (
                <Copy size={14} className="text-muted-foreground" />
              )}
            </button>
          )}

          {/* Skill collapsible for first user message */}
          {isFirstSkillMessage && skill && (
            <details
              className="mb-3 border-2 border-primary/30 bg-primary/5 rounded-md"
            >
              <summary className="flex items-center gap-2 px-3 py-2 cursor-pointer select-none text-primary">
                <Sparkles size={14} className="mono" />
                <span className="font-medium text-sm mono">{skill.name}</span>
                {showSkill ? (
                  <ChevronUp size={14} className="ml-auto" />
                ) : (
                  <ChevronDown size={14} className="ml-auto" />
                )}
              </summary>
              <div className="px-3 pb-3 text-sm">
                {skill.description && (
                  <p className="text-muted-foreground mb-2">{skill.description}</p>
                )}
                <div className="p-2 bg-muted/50 border border-border rounded font-mono text-xs whitespace-pre-wrap text-muted-foreground">
                  {skill.prompt}
                </div>
              </div>
            </details>
          )}

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
              "p-4 border-2 prose prose-sm dark:prose-invert max-w-none",
              isUser
                ? "bg-primary/10 border-primary/30 text-foreground"
                : "bg-muted border-border text-foreground prose-pre:bg-background prose-pre:border prose-pre:border-border"
            )}
          >
            {sending ? (
              <div className="flex items-center justify-end gap-2 text-muted-foreground">
                <div className="flex gap-1">
                  <span className="typing-dot w-2 h-2 bg-muted-foreground rounded-sm animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="typing-dot w-2 h-2 bg-muted-foreground rounded-sm animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="typing-dot w-2 h-2 bg-muted-foreground rounded-sm animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
                <span className="mono text-sm">// thinking</span>
              </div>
            ) : message.content ? (
              <ReactMarkdown>{message.content}</ReactMarkdown>
            ) : (
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
