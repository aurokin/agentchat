import { describe, expect, test } from "bun:test";
import type { SocketEventResolution } from "../conversation-runtime-controller";
import { planConversationMessageLifecycleResolution } from "../conversation-runtime-messages";

describe("conversation runtime messages", () => {
    const activeRun = {
        conversationId: "chat-1",
        agentId: "agent-1",
        assistantMessageId: "assistant-2",
        userContent: "hello",
        content: "second message",
        runId: "run-1",
    } as const;

    test("plans message.started inserts with previous message patching", () => {
        const resolution: SocketEventResolution = {
            type: "message.started",
            activeRun,
            message: {
                id: "assistant-2",
                sessionId: "chat-1",
                role: "assistant",
                content: "second message",
                contextContent: "second message",
                createdAt: 2,
                runId: "run-1",
                kind: "assistant_status",
            },
            streamingMessage: {
                id: "assistant-2",
                content: "second message",
            },
            previousMessagePatch: {
                id: "assistant-1",
                kind: "assistant_message",
            },
        };

        expect(planConversationMessageLifecycleResolution(resolution)).toEqual({
            type: "message.started",
            activeRun,
            insertedMessage: resolution.message,
            previousMessagePatch: {
                id: "assistant-1",
                kind: "assistant_message",
            },
            streamingMessage: {
                id: "assistant-2",
                content: "second message",
            },
        });
    });

    test("plans message.completed streaming updates only for the active assistant message", () => {
        const activeAssistantResolution: SocketEventResolution = {
            type: "message.completed",
            activeRun,
            messageId: "assistant-2",
            finalContent: "second message",
        };

        expect(
            planConversationMessageLifecycleResolution(
                activeAssistantResolution,
            ),
        ).toEqual({
            type: "message.completed",
            activeRun: activeAssistantResolution.activeRun,
            messagePatch: {
                id: "assistant-2",
                content: "second message",
                contextContent: "second message",
                status: "completed",
            },
            streamingMessage: {
                id: "assistant-2",
                content: "second message",
            },
        });

        expect(
            planConversationMessageLifecycleResolution({
                ...activeAssistantResolution,
                messageId: "assistant-1",
            }),
        ).toEqual({
            type: "message.completed",
            activeRun: activeAssistantResolution.activeRun,
            messagePatch: {
                id: "assistant-1",
                content: "second message",
                contextContent: "second message",
                status: "completed",
            },
            streamingMessage: null,
        });
    });
});
