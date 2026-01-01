"use client";

import React from "react";
import type { Message } from "@/lib/types";
import { format } from "date-fns";
import { User, Bot, Brain } from "lucide-react";
import { cn } from "@/lib/utils";

interface MessageListProps {
  messages: Message[];
}

export function MessageList({ messages }: MessageListProps) {
  if (messages.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        <p>No messages yet. Start a conversation!</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6">
      {messages.map((message) => (
        <MessageItem key={message.id} message={message} />
      ))}
    </div>
  );
}

function MessageItem({ message }: { message: Message }) {
  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";

  return (
    <div
      className={cn(
        "flex gap-4",
        isUser ? "flex-row-reverse" : "flex-row"
      )}
    >
      <div
        className={cn(
          "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0",
          isUser ? "bg-blue-500 text-white" : "bg-green-500 text-white"
        )}
      >
        {isUser ? <User size={16} /> : <Bot size={16} />}
      </div>

      <div
        className={cn(
          "flex-1 min-w-0",
          isUser ? "text-right" : "text-left"
        )}
      >
        <div className="inline-block max-w-[80%]">
          {/* Thinking content */}
          {message.thinking && (
            <div className="mb-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="flex items-center gap-2 text-amber-700 text-sm font-medium mb-1">
                <Brain size={14} />
                Thinking
              </div>
              <p className="text-amber-800 text-sm whitespace-pre-wrap">
                {message.thinking}
              </p>
            </div>
          )}

          {/* Main content */}
          <div
            className={cn(
              "p-4 rounded-lg whitespace-pre-wrap",
              isUser
                ? "bg-blue-500 text-white"
                : "bg-gray-100 text-gray-900"
            )}
          >
            {message.content || (
              <span className="text-gray-400 italic">...</span>
            )}
          </div>

          <p className="text-xs text-gray-400 mt-1">
            {format(message.createdAt, "h:mm a")}
          </p>
        </div>
      </div>
    </div>
  );
}
