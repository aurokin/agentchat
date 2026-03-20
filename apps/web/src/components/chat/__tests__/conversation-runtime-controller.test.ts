import { describe, expect, test } from "bun:test";

import type { AgentchatSocketEvent } from "@/lib/agentchat-socket";
import {
    SupportedParameter,
    type ChatSession,
    type Message,
    type ProviderModel,
} from "@/lib/types";
import {
    buildInterruptCommand,
    connectConversationSocket,
    flushPendingConversationInterrupt,
    getChatTitleUpdate,
    interruptConversationRun,
    prepareConversationSend,
    requestConversationInterrupt,
    resolveConversationRuntimeSync,
    resolveConversationSocketEvent,
    runConversationSend,
} from "@/components/chat/conversation-runtime-controller";

function createChat(overrides: Partial<ChatSession> = {}): ChatSession {
    return {
        id: "chat-1",
        agentId: "agent-1",
        title: "New Chat",
        modelId: "gpt-5.3-codex",
        variantId: "high",
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

function createModels(): ProviderModel[] {
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

        expect(sendPlan.effectiveReasoningEffort).toBe("high");
        expect(sendPlan.titleUpdate?.title).toBe("New prompt");
        expect(sendPlan.userMessage).toMatchObject({
            id: "user-1",
            role: "user",
            content: "New prompt",
            contextContent: "New prompt",
            modelId: "gpt-5.3-codex",
            reasoningEffort: "high",
            chatId: "chat-1",
        });
        expect(sendPlan.assistantMessage).toMatchObject({
            id: "assistant-1",
            role: "assistant",
            content: "",
            contextContent: "",
            modelId: "gpt-5.3-codex",
            reasoningEffort: "high",
            chatId: "chat-1",
        });
        expect(sendPlan.command).toEqual({
            id: "command-1",
            type: "conversation.send",
            payload: {
                conversationId: "chat-1",
                agentId: "agent-1",
                modelId: "gpt-5.3-codex",
                variantId: "high",
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

    test("falls back to no reasoning effort when the selected model does not support reasoning", () => {
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

        expect(sendPlan.effectiveReasoningEffort).toBe("none");
        expect(sendPlan.userMessage.reasoningEffort).toBe("none");
        expect(sendPlan.command.payload.variantId).toBe("high");
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
        expect(
            buildInterruptCommand("chat-1", "agent-1", () => "interrupt-1"),
        ).toEqual({
            id: "interrupt-1",
            type: "conversation.interrupt",
            payload: {
                conversationId: "chat-1",
                agentId: "agent-1",
            },
        });
    });

    test("connects and subscribes the current conversation socket session", async () => {
        const calls: string[] = [];
        const cleanup = connectConversationSocket({
            currentChat: { id: "chat-1", agentId: "agent-1" },
            dependencies: {
                subscribeToConversation: (conversationId, agentId) => {
                    calls.push(`subscribe:${agentId}:${conversationId}`);
                    return () => {
                        calls.push(`unsubscribe:${agentId}:${conversationId}`);
                    };
                },
                ensureConnected: async () => {
                    calls.push("ensureConnected");
                },
            },
        });

        await Promise.resolve();
        expect(calls).toEqual(["subscribe:agent-1:chat-1", "ensureConnected"]);
        cleanup?.();
        expect(calls).toEqual([
            "subscribe:agent-1:chat-1",
            "ensureConnected",
            "unsubscribe:agent-1:chat-1",
        ]);
    });

    test("reports socket bootstrap failures through the provided error handler", async () => {
        const errors: string[] = [];
        connectConversationSocket({
            currentChat: { id: "chat-1", agentId: "agent-1" },
            dependencies: {
                subscribeToConversation: () => () => {},
                ensureConnected: async () => {
                    throw new Error("connect failed");
                },
                onConnectionError: (error) => {
                    errors.push(
                        error instanceof Error ? error.message : String(error),
                    );
                },
            },
        });

        await Promise.resolve();
        await Promise.resolve();
        expect(errors).toEqual(["connect failed"]);
    });

    test("skips socket setup when no conversation is selected", () => {
        const cleanup = connectConversationSocket({
            currentChat: null,
            dependencies: {
                subscribeToConversation: () => {
                    throw new Error("should not subscribe");
                },
                ensureConnected: async () => {
                    throw new Error("should not connect");
                },
            },
        });

        expect(cleanup).toBeNull();
    });

    test("runs a successful send flow and returns the active run", async () => {
        const calls: string[] = [];
        const result = await runConversationSend({
            chat: createChat(),
            messages: [],
            models: createModels(),
            content: "Ship it",
            dependencies: {
                addMessage: async (message) => {
                    calls.push(`add:${message.role}:${message.id}`);
                    return {
                        id: message.id,
                        sessionId: message.chatId,
                        role: message.role,
                        content: message.content,
                        contextContent: message.contextContent,
                        modelId: message.modelId,
                        reasoningEffort: message.reasoningEffort,
                        createdAt: 1,
                    };
                },
                updateChat: async (chat) => {
                    calls.push(`updateChat:${chat.title}`);
                },
                updateMessage: async () => {
                    calls.push("updateMessage");
                },
                queueStreamingMessageUpdate: (update) => {
                    calls.push(`stream:${update?.id ?? "none"}`);
                },
                ensureConnected: async () => {
                    calls.push("ensureConnected");
                },
                sendCommand: (command) => {
                    calls.push(`send:${command.type}`);
                },
            },
        });

        expect(result.status).toBe("sent");
        expect(result).toMatchObject({
            activeRun: {
                conversationId: "chat-1",
                userContent: "Ship it",
                content: "",
                runId: null,
            },
        });
        expect(calls).toEqual([
            expect.stringMatching(/^add:user:/),
            "updateChat:Ship it",
            expect.stringMatching(/^add:assistant:/),
            expect.stringMatching(/^stream:/),
            "ensureConnected",
            "send:conversation.send",
        ]);
    });

    test("cleans up the assistant draft when connection setup fails", async () => {
        const updates: Array<{ id: string; content: string; context: string }> =
            [];
        const result = await runConversationSend({
            chat: createChat(),
            messages: [],
            models: createModels(),
            content: "Break it",
            dependencies: {
                addMessage: async (message) => ({
                    id: message.id,
                    sessionId: message.chatId,
                    role: message.role,
                    content: message.content,
                    contextContent: message.contextContent,
                    modelId: message.modelId,
                    reasoningEffort: message.reasoningEffort,
                    createdAt: 1,
                }),
                updateChat: async () => {},
                updateMessage: async (id, update) => {
                    updates.push({
                        id,
                        content: update.content ?? "",
                        context: update.contextContent ?? "",
                    });
                },
                queueStreamingMessageUpdate: () => {},
                ensureConnected: async () => {
                    throw new Error("socket unavailable");
                },
                sendCommand: () => {},
            },
        });

        expect(result.status).toBe("failed");
        if (result.status !== "failed") {
            throw new Error("Expected failed result");
        }
        if (!result.assistantMessageId) {
            throw new Error("Expected an assistant message id for cleanup");
        }
        expect(result).toEqual({
            status: "failed",
            assistantMessageId: expect.any(String),
            error: {
                message: "socket unavailable",
                isRetryable: true,
            },
            retryChat: {
                content: "Break it",
                contextContent: "Break it",
            },
        });
        expect(updates).toEqual([
            {
                id: result.assistantMessageId,
                content: "",
                context: "",
            },
        ]);
    });

    test("returns an interrupt error when the socket command throws", () => {
        expect(
            interruptConversationRun({
                activeRun: {
                    conversationId: "chat-1",
                    assistantMessageId: "assistant-1",
                    userContent: "Hello",
                    content: "",
                    runId: "run-1",
                },
                agentId: "agent-1",
                sendCommand: () => {
                    throw new Error("cannot interrupt");
                },
            }),
        ).toEqual({
            message: "cannot interrupt",
            isRetryable: true,
        });
    });

    test("queues an interrupt when send is in-flight before the run is bound", () => {
        const calls: string[] = [];

        expect(
            requestConversationInterrupt({
                activeRun: null,
                agentId: "agent-1",
                isSending: true,
                queuePendingInterrupt: () => {
                    calls.push("queued");
                },
                sendCommand: () => {
                    calls.push("sent");
                },
            }),
        ).toEqual({
            queued: true,
            error: null,
        });

        expect(calls).toEqual(["queued"]);
    });

    test("flushes a queued interrupt once the run is available", () => {
        const commands: string[] = [];

        expect(
            flushPendingConversationInterrupt({
                pendingInterrupt: true,
                activeRun: {
                    conversationId: "chat-1",
                    assistantMessageId: "assistant-1",
                    userContent: "Hello",
                    content: "",
                    runId: "run-1",
                },
                agentId: "agent-1",
                sendCommand: (command) => {
                    commands.push(command.type);
                },
            }),
        ).toBeNull();

        expect(commands).toEqual(["conversation.interrupt"]);
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
                agentId: "agent-1",
                conversationId: "chat-1",
                runId: "run-1",
                messageId: "assistant-1",
            },
        };

        expect(
            resolveConversationSocketEvent({
                currentChatId: "chat-1",
                currentAgentId: "agent-1",
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

    test("starts a second assistant transcript message within an active run", () => {
        const event: AgentchatSocketEvent = {
            type: "message.started",
            payload: {
                agentId: "agent-1",
                conversationId: "chat-1",
                runId: "run-1",
                messageId: "assistant-2",
                messageIndex: 1,
                kind: "assistant_message",
                content: "Report\n- Done",
                previousMessageId: "assistant-1",
                previousKind: "assistant_status",
            },
        };

        expect(
            resolveConversationSocketEvent({
                currentChatId: "chat-1",
                currentAgentId: "agent-1",
                event,
                activeRun: {
                    conversationId: "chat-1",
                    assistantMessageId: "assistant-1",
                    userContent: "Recover this",
                    content: "Status update",
                    runId: "run-1",
                },
                messages: createMessages(),
            }),
        ).toEqual({
            type: "message.started",
            activeRun: {
                conversationId: "chat-1",
                assistantMessageId: "assistant-2",
                userContent: "Recover this",
                content: "Report\n- Done",
                runId: "run-1",
            },
            message: {
                id: "assistant-2",
                sessionId: "chat-1",
                role: "assistant",
                kind: "assistant_message",
                content: "Report\n- Done",
                contextContent: "Report\n- Done",
                status: "streaming",
                runId: "run-1",
                runMessageIndex: 1,
                createdAt: expect.any(Number),
            },
            streamingMessage: {
                id: "assistant-2",
                content: "Report\n- Done",
            },
            previousMessagePatch: {
                id: "assistant-1",
                kind: "assistant_status",
            },
        });
    });

    test("produces retry metadata for failed runs", () => {
        const event: AgentchatSocketEvent = {
            type: "run.failed",
            payload: {
                agentId: "agent-1",
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
                currentAgentId: "agent-1",
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
                agentId: "agent-2",
                conversationId: "chat-1",
                messageId: "assistant-1",
                delta: "x",
                content: "x",
            },
        };

        expect(
            resolveConversationSocketEvent({
                currentChatId: "chat-1",
                currentAgentId: "agent-1",
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

    test("recovers persisted recovering runtime state for the current chat", () => {
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
                content: "Recovering output",
                contextContent: "Recovering output",
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
                    phase: "recovering",
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
                content: "Recovering output",
                runId: "run-1",
            },
        });
    });

    test("hydrates a missing local run id from persisted runtime state", () => {
        expect(
            resolveConversationRuntimeSync({
                currentChat: createChat(),
                isMessagesLoading: false,
                messages: createMessages(),
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
                activeRun: {
                    conversationId: "chat-1",
                    assistantMessageId: "assistant-1",
                    userContent: "Old prompt",
                    content: "Old output",
                    runId: null,
                },
            }),
        ).toEqual({
            shouldReset: false,
            recoveredRun: {
                conversationId: "chat-1",
                assistantMessageId: "assistant-1",
                userContent: "Old prompt",
                content: "Old output",
                runId: "run-1",
            },
        });
    });

    test("resets a stale local active run when persisted runtime state is no longer active", () => {
        expect(
            resolveConversationRuntimeSync({
                currentChat: createChat(),
                isMessagesLoading: false,
                messages: createMessages(),
                runtimeState: {
                    phase: "idle",
                    runId: null,
                    assistantMessageId: null,
                    provider: null,
                    errorMessage: null,
                    startedAt: null,
                    completedAt: Date.now(),
                    lastEventAt: Date.now(),
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
            recoveredRun: null,
        });
    });

    test("resets and recovers when the current chat has moved to a different persisted run", () => {
        const messages: Message[] = [
            {
                id: "user-2",
                sessionId: "chat-1",
                role: "user",
                content: "New prompt",
                contextContent: "New prompt",
                createdAt: 1,
            },
            {
                id: "assistant-2",
                sessionId: "chat-1",
                role: "assistant",
                content: "New persisted output",
                contextContent: "New persisted output",
                createdAt: 2,
                runId: "run-2",
            },
        ];

        expect(
            resolveConversationRuntimeSync({
                currentChat: createChat(),
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
                conversationId: "chat-1",
                assistantMessageId: "assistant-2",
                userContent: "New prompt",
                content: "New persisted output",
                runId: "run-2",
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
