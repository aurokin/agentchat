import { describe, expect, test } from "bun:test";

import type { AgentchatSocketEvent } from "@/lib/agentchat-socket";
import {
    SupportedParameter,
    type ChatSession,
    type Message,
    type OpenRouterModel,
} from "@/lib/types";
import {
    buildInterruptCommand,
    getChatTitleUpdate,
    prepareConversationSend,
    resolveConversationRuntimeSync,
    resolveConversationSocketEvent,
} from "@/components/chat/conversation-runtime-controller";

function createChat(overrides: Partial<ChatSession> = {}): ChatSession {
    return {
        id: "chat-1",
        agentId: "agent-1",
        title: "New Chat",
        modelId: "gpt-5.3-codex",
        thinking: "high",
        createdAt: 1,
        updatedAt: 1,
        ...overrides,
    };
}

function createMessages(): Message[] {
    return [
        {
            id: "user-0",
            sessionId: "chat-1",
            role: "user",
            content: "Earlier question",
            contextContent: "Earlier question",
            createdAt: 1,
        },
        {
            id: "assistant-0",
            sessionId: "chat-1",
            role: "assistant",
            content: "Earlier answer",
            contextContent: "Earlier answer",
            createdAt: 2,
        },
    ];
}

function createModels(): OpenRouterModel[] {
    return [
        {
            id: "gpt-5.3-codex",
            name: "GPT 5.3 Codex",
            provider: "codex",
            supportedParameters: [SupportedParameter.Reasoning],
        },
        {
            id: "basic-codex",
            name: "Basic Codex",
            provider: "codex",
            supportedParameters: [],
        },
    ];
}

describe("conversation runtime controller", () => {
    test("prepares a send plan with chat history and title update", () => {
        const ids = ["user-1", "assistant-1", "command-1"];
        const sendPlan = prepareConversationSend({
            chat: createChat(),
            messages: [],
            models: createModels(),
            content: "New prompt",
            createId: () => ids.shift() ?? "unexpected-id",
        });

        expect(sendPlan.effectiveThinking).toBe("high");
        expect(sendPlan.shouldPersistDefaultThinking).toBe(true);
        expect(sendPlan.titleUpdate?.title).toBe("New prompt");
        expect(sendPlan.userMessage).toMatchObject({
            id: "user-1",
            role: "user",
            content: "New prompt",
            contextContent: "New prompt",
            modelId: "gpt-5.3-codex",
            thinkingLevel: "high",
            chatId: "chat-1",
        });
        expect(sendPlan.assistantMessage).toMatchObject({
            id: "assistant-1",
            role: "assistant",
            content: "",
            contextContent: "",
            modelId: "gpt-5.3-codex",
            thinkingLevel: "high",
            chatId: "chat-1",
        });
        expect(sendPlan.command).toEqual({
            id: "command-1",
            type: "conversation.send",
            payload: {
                conversationId: "chat-1",
                agentId: "agent-1",
                modelId: "gpt-5.3-codex",
                thinking: "high",
                content: "New prompt",
                userMessageId: "user-1",
                assistantMessageId: "assistant-1",
                history: [],
            },
        });
        expect(sendPlan.activeRun).toEqual({
            conversationId: "chat-1",
            assistantMessageId: "assistant-1",
            userContent: "New prompt",
            content: "",
            runId: null,
        });
    });

    test("falls back to no thinking when the selected model does not support reasoning", () => {
        const sendPlan = prepareConversationSend({
            chat: createChat({ modelId: "basic-codex" }),
            messages: [],
            models: createModels(),
            content: "No reasoning prompt",
            createId: (() => {
                let counter = 0;
                return () => `id-${++counter}`;
            })(),
        });

        expect(sendPlan.effectiveThinking).toBe("none");
        expect(sendPlan.shouldPersistDefaultThinking).toBe(false);
        expect(sendPlan.userMessage.thinkingLevel).toBe("none");
        expect(sendPlan.command.payload.thinking).toBe("none");
    });

    test("includes prior transcript entries in the send command history", () => {
        const sendPlan = prepareConversationSend({
            chat: createChat(),
            messages: createMessages(),
            models: createModels(),
            content: "Follow up",
            createId: (() => {
                let counter = 0;
                return () => `id-${++counter}`;
            })(),
        });

        expect(sendPlan.titleUpdate).toBeNull();
        expect(sendPlan.command.payload.history).toEqual([
            { role: "user", content: "Earlier question" },
            { role: "assistant", content: "Earlier answer" },
        ]);
    });

    test("builds an interrupt command for the active conversation", () => {
        expect(buildInterruptCommand("chat-1", () => "interrupt-1")).toEqual({
            id: "interrupt-1",
            type: "conversation.interrupt",
            payload: {
                conversationId: "chat-1",
            },
        });
    });

    test("recovers a run from run.started when there is no active local run", () => {
        const messages: Message[] = [
            {
                id: "user-1",
                sessionId: "chat-1",
                role: "user",
                content: "Recover this",
                contextContent: "Recover this",
                createdAt: 1,
            },
            {
                id: "assistant-1",
                sessionId: "chat-1",
                role: "assistant",
                content: "Partial response",
                contextContent: "Partial response",
                createdAt: 2,
            },
        ];

        const event: AgentchatSocketEvent = {
            type: "run.started",
            payload: {
                conversationId: "chat-1",
                runId: "run-1",
                messageId: "assistant-1",
            },
        };

        expect(
            resolveConversationSocketEvent({
                currentChatId: "chat-1",
                event,
                activeRun: null,
                messages,
            }),
        ).toEqual({
            type: "run.started",
            activeRun: {
                conversationId: "chat-1",
                assistantMessageId: "assistant-1",
                userContent: "Recover this",
                content: "Partial response",
                runId: "run-1",
            },
            recovered: true,
            streamingMessage: {
                id: "assistant-1",
                content: "Partial response",
            },
        });
    });

    test("produces retry metadata for failed runs", () => {
        const event: AgentchatSocketEvent = {
            type: "run.failed",
            payload: {
                conversationId: "chat-1",
                runId: "run-1",
                error: {
                    message: "Codex failed",
                },
            },
        };

        expect(
            resolveConversationSocketEvent({
                currentChatId: "chat-1",
                event,
                activeRun: {
                    conversationId: "chat-1",
                    assistantMessageId: "assistant-1",
                    userContent: "Retry me",
                    content: "Partial output",
                    runId: "run-1",
                },
                messages: createMessages(),
            }),
        ).toEqual({
            type: "run.failed",
            activeRun: {
                conversationId: "chat-1",
                assistantMessageId: "assistant-1",
                userContent: "Retry me",
                content: "Partial output",
                runId: "run-1",
            },
            finalContent: "Partial output",
            error: {
                message: "Codex failed",
                isRetryable: true,
            },
            retryChat: {
                content: "Retry me",
                contextContent: "Retry me",
            },
        });
    });

    test("ignores events for other chats or runs", () => {
        const event: AgentchatSocketEvent = {
            type: "message.delta",
            payload: {
                conversationId: "chat-2",
                messageId: "assistant-1",
                delta: "x",
                content: "x",
            },
        };

        expect(
            resolveConversationSocketEvent({
                currentChatId: "chat-1",
                event,
                activeRun: {
                    conversationId: "chat-1",
                    assistantMessageId: "assistant-1",
                    userContent: "Hello",
                    content: "",
                    runId: "run-1",
                },
                messages: createMessages(),
            }),
        ).toEqual({ type: "ignore" });
    });

    test("keeps title unchanged once a conversation already has history", () => {
        expect(
            getChatTitleUpdate(createChat({ title: "Pinned" }), "Prompt", 1),
        ).toBeNull();
    });

    test("requests a local runtime reset when the active run belongs to another chat", () => {
        expect(
            resolveConversationRuntimeSync({
                currentChat: createChat({ id: "chat-2" }),
                isMessagesLoading: false,
                messages: createMessages(),
                runtimeState: {
                    phase: "idle",
                    runId: null,
                    assistantMessageId: null,
                    provider: null,
                    errorMessage: null,
                    startedAt: null,
                    completedAt: null,
                    lastEventAt: null,
                },
                activeRun: {
                    conversationId: "chat-1",
                    assistantMessageId: "assistant-1",
                    userContent: "Old run",
                    content: "Old content",
                    runId: "run-1",
                },
            }),
        ).toEqual({
            shouldReset: true,
            recoveredRun: null,
        });
    });

    test("recovers persisted runtime state for the current chat", () => {
        const messages: Message[] = [
            {
                id: "user-1",
                sessionId: "chat-1",
                role: "user",
                content: "Recover me",
                contextContent: "Recover me",
                createdAt: 1,
            },
            {
                id: "assistant-1",
                sessionId: "chat-1",
                role: "assistant",
                content: "Partial persisted output",
                contextContent: "Partial persisted output",
                createdAt: 2,
                runId: "run-1",
            },
        ];

        expect(
            resolveConversationRuntimeSync({
                currentChat: createChat(),
                isMessagesLoading: false,
                messages,
                runtimeState: {
                    phase: "active",
                    runId: "run-1",
                    assistantMessageId: "assistant-1",
                    provider: "codex-default",
                    errorMessage: null,
                    startedAt: 1,
                    completedAt: null,
                    lastEventAt: 2,
                },
                activeRun: null,
            }),
        ).toEqual({
            shouldReset: false,
            recoveredRun: {
                conversationId: "chat-1",
                assistantMessageId: "assistant-1",
                userContent: "Recover me",
                content: "Partial persisted output",
                runId: "run-1",
            },
        });
    });

    test("can reset and recover in the same sync pass after a conversation switch", () => {
        const messages: Message[] = [
            {
                id: "user-2",
                sessionId: "chat-2",
                role: "user",
                content: "New conversation prompt",
                contextContent: "New conversation prompt",
                createdAt: 1,
            },
            {
                id: "assistant-2",
                sessionId: "chat-2",
                role: "assistant",
                content: "Recovered output",
                contextContent: "Recovered output",
                createdAt: 2,
                runId: "run-2",
            },
        ];

        expect(
            resolveConversationRuntimeSync({
                currentChat: createChat({ id: "chat-2", agentId: "agent-2" }),
                isMessagesLoading: false,
                messages,
                runtimeState: {
                    phase: "active",
                    runId: "run-2",
                    assistantMessageId: "assistant-2",
                    provider: "codex-default",
                    errorMessage: null,
                    startedAt: 1,
                    completedAt: null,
                    lastEventAt: 2,
                },
                activeRun: {
                    conversationId: "chat-1",
                    assistantMessageId: "assistant-1",
                    userContent: "Old prompt",
                    content: "Old output",
                    runId: "run-1",
                },
            }),
        ).toEqual({
            shouldReset: true,
            recoveredRun: {
                conversationId: "chat-2",
                assistantMessageId: "assistant-2",
                userContent: "New conversation prompt",
                content: "Recovered output",
                runId: "run-2",
            },
        });
    });
});
