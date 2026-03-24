import { describe, expect, test } from "bun:test";

import {
    applyStreamingMessageOverlay,
    createRecoveredActiveRunFromRuntimeState,
    createRecoveredActiveRunFromSocket,
} from "@/components/chat/conversation-runtime-helpers";
import type {
    ChatSession,
    ConversationRuntimeState,
    Message,
} from "@/lib/types";

function createChat(overrides: Partial<ChatSession> = {}): ChatSession {
    return {
        id: "chat-1",
        agentId: "agent-1",
        title: "Chat",
        modelId: "gpt-5.3-codex",
        createdAt: 1,
        updatedAt: 1,
        ...overrides,
    };
}

function createMessages(): Message[] {
    return [
        {
            id: "user-1",
            sessionId: "chat-1",
            role: "user",
            content: "First prompt",
            contextContent: "First prompt",
            createdAt: 1,
        },
        {
            id: "assistant-1",
            sessionId: "chat-1",
            role: "assistant",
            content: "Partial answer",
            contextContent: "Partial answer",
            createdAt: 2,
            runId: "run-1",
            status: "streaming",
        },
    ];
}

const activeRuntimeState: ConversationRuntimeState = {
    phase: "active",
    runId: "run-1",
    assistantMessageId: "assistant-1",
    provider: "codex-default",
    errorMessage: null,
    startedAt: 1,
    completedAt: null,
    lastEventAt: 2,
};

const recoveringRuntimeState: ConversationRuntimeState = {
    ...activeRuntimeState,
    phase: "recovering",
};

describe("conversation runtime helpers", () => {
    test("recovers an active run from a socket run.started event", () => {
        expect(
            createRecoveredActiveRunFromSocket({
                conversationId: "chat-1",
                agentId: "agent-1",
                messageId: "assistant-1",
                runId: "run-1",
                messages: createMessages(),
            }),
        ).toEqual({
            conversationId: "chat-1",
            agentId: "agent-1",
            assistantMessageId: "assistant-1",
            userContent: "First prompt",
            content: "Partial answer",
            runId: "run-1",
        });
    });

    test("recovers an active run from persisted runtime state", () => {
        expect(
            createRecoveredActiveRunFromRuntimeState({
                currentChat: createChat(),
                messages: createMessages(),
                runtimeState: activeRuntimeState,
            }),
        ).toEqual({
            conversationId: "chat-1",
            agentId: "agent-1",
            assistantMessageId: "assistant-1",
            userContent: "First prompt",
            content: "Partial answer",
            runId: "run-1",
        });
    });

    test("recovers a recovering run from persisted runtime state", () => {
        expect(
            createRecoveredActiveRunFromRuntimeState({
                currentChat: createChat(),
                messages: createMessages(),
                runtimeState: recoveringRuntimeState,
            }),
        ).toEqual({
            conversationId: "chat-1",
            agentId: "agent-1",
            assistantMessageId: "assistant-1",
            userContent: "First prompt",
            content: "Partial answer",
            runId: "run-1",
        });
    });

    test("overlays streaming content without mutating unrelated messages", () => {
        const messages = createMessages();
        const userMessage = messages[0];
        const assistantMessage = messages[1];
        if (!userMessage || !assistantMessage) {
            throw new Error("Expected seeded user and assistant messages.");
        }

        expect(
            applyStreamingMessageOverlay(messages, {
                id: "assistant-1",
                content: "Updated answer",
            }),
        ).toEqual([
            userMessage,
            {
                ...assistantMessage,
                content: "Updated answer",
                contextContent: "Updated answer",
            },
        ]);
    });
});
