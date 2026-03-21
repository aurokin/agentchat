import { describe, expect, test } from "bun:test";
import type { ConversationSendCommand } from "@/lib/agentchat-socket";
import type { ChatSession, Message } from "@shared/core/types";
import { SupportedParameter, type ProviderModel } from "@shared/core/models";
import {
    flushPendingMobileConversationInterrupt,
    interruptMobileConversationRun,
    requestMobileConversationInterrupt,
    resolveMobileConversationRuntimeSync,
    runMobileConversationSend,
} from "../conversation-runtime-controller";
import type { ConversationRuntimeState } from "@/lib/types";

function createChat(overrides: Partial<ChatSession> = {}): ChatSession {
    return {
        id: "chat-1",
        agentId: "agent-1",
        title: "New Chat",
        modelId: "provider/model-1",
        variantId: "deep",
        settingsLockedAt: null,
        createdAt: 1,
        updatedAt: 1,
        ...overrides,
    };
}

function createMessage(overrides: Partial<Message> = {}): Message {
    return {
        id: "message-1",
        sessionId: "chat-1",
        role: "user",
        content: "hello",
        contextContent: "hello",
        status: "completed",
        createdAt: 1,
        ...overrides,
    };
}

const models: ProviderModel[] = [
    {
        id: "provider/model-1",
        name: "Model 1",
        provider: "Provider",
        supportedParameters: [SupportedParameter.Reasoning],
    },
];

function createRuntimeState(
    overrides: Partial<ConversationRuntimeState> = {},
): ConversationRuntimeState {
    return {
        phase: "idle",
        runId: null,
        assistantMessageId: null,
        provider: null,
        errorMessage: null,
        startedAt: null,
        completedAt: null,
        lastEventAt: null,
        ...overrides,
    };
}

describe("mobile conversation runtime controller", () => {
    test("runs a successful send flow and locks settings", async () => {
        const added: Array<Record<string, unknown>> = [];
        const updatedChats: ChatSession[] = [];
        const sentCommands: ConversationSendCommand[] = [];

        const result = await runMobileConversationSend({
            chat: createChat(),
            messages: [],
            models,
            content: "hello world",
            dependencies: {
                addMessage: async (message) => {
                    added.push(message);
                    return createMessage(message as Partial<Message>);
                },
                updateMessage: async () => {},
                updateChat: async (chat) => {
                    updatedChats.push(chat);
                },
                queueStreamingMessageUpdate: () => {},
                ensureConnected: async () => {},
                sendCommand: (command) => {
                    sentCommands.push(command);
                },
            },
        });

        expect(result.status).toBe("sent");
        expect(added).toHaveLength(2);
        expect(added[0]?.variantId).toBe("deep");
        expect(updatedChats).toHaveLength(1);
        expect(updatedChats[0]?.settingsLockedAt).not.toBeNull();
        expect(sentCommands).toHaveLength(1);
        expect(sentCommands[0]?.payload.variantId).toBe("deep");
    });

    test("returns retry metadata when connection setup fails", async () => {
        const result = await runMobileConversationSend({
            chat: createChat(),
            messages: [],
            models,
            content: "hello world",
            dependencies: {
                addMessage: async (message) =>
                    createMessage(message as Partial<Message>),
                updateMessage: async () => {},
                updateChat: async () => {},
                queueStreamingMessageUpdate: () => {},
                ensureConnected: async () => {
                    throw new Error("socket failed");
                },
                sendCommand: () => {},
            },
        });

        expect(result.status).toBe("failed");
        if (result.status === "failed") {
            expect(result.error.message).toBe("socket failed");
            expect(result.retryChat.content).toBe("hello world");
        }
    });

    test("builds an interrupt error when the socket command throws", () => {
        const error = interruptMobileConversationRun({
            activeRun: {
                conversationId: "chat-1",
                agentId: "agent-1",
                assistantMessageId: "assistant-1",
                userContent: "hello",
                content: "",
                runId: "run-1",
            },
            agentId: "agent-1",
            sendCommand: () => {
                throw new Error("cannot interrupt");
            },
        });

        expect(error).toEqual({
            message: "cannot interrupt",
            isRetryable: true,
        });
    });

    test("queues an interrupt when send is in-flight before the run is bound", () => {
        const calls: string[] = [];

        expect(
            requestMobileConversationInterrupt({
                activeRun: null,
                agentId: "agent-1",
                isLoading: true,
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

    test("flushes a queued mobile interrupt once the run is available", () => {
        const commands: string[] = [];

        expect(
            flushPendingMobileConversationInterrupt({
                pendingInterrupt: true,
                activeRun: {
                    conversationId: "chat-1",
                    assistantMessageId: "assistant-1",
                    userContent: "hello",
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

    test("resets a stale local active run when persisted runtime is terminal", () => {
        const resolution = resolveMobileConversationRuntimeSync({
            currentChat: createChat(),
            isMessagesLoading: false,
            messages: [],
            runtimeState: createRuntimeState({
                phase: "interrupted",
            }),
            activeRun: {
                conversationId: "chat-1",
                assistantMessageId: "assistant-1",
                userContent: "hello",
                content: "",
                runId: "run-1",
            },
        });

        expect(resolution).toEqual({
            shouldReset: true,
            recoveredRun: null,
        });
    });

    test("recovers persisted recovering runtime state for the current chat", () => {
        const resolution = resolveMobileConversationRuntimeSync({
            currentChat: createChat(),
            isMessagesLoading: false,
            messages: [
                createMessage({
                    id: "user-1",
                    role: "user",
                    content: "hello",
                    contextContent: "hello",
                }),
                createMessage({
                    id: "assistant-1",
                    role: "assistant",
                    content: "Recovering output",
                    contextContent: "Recovering output",
                    runId: "run-1",
                }),
            ],
            runtimeState: createRuntimeState({
                phase: "recovering",
                runId: "run-1",
                assistantMessageId: "assistant-1",
                provider: "codex-default",
                startedAt: 1,
                lastEventAt: 2,
            }),
            activeRun: null,
        });

        expect(resolution).toEqual({
            shouldReset: false,
            recoveredRun: {
                conversationId: "chat-1",
                agentId: "agent-1",
                assistantMessageId: "assistant-1",
                userContent: "hello",
                content: "Recovering output",
                runId: "run-1",
            },
        });
    });

    test("hydrates a missing local run id from persisted runtime state", () => {
        const resolution = resolveMobileConversationRuntimeSync({
            currentChat: createChat(),
            isMessagesLoading: false,
            messages: [],
            runtimeState: createRuntimeState({
                phase: "active",
                runId: "run-1",
                assistantMessageId: "assistant-1",
                provider: "codex-default",
                startedAt: 1,
                lastEventAt: 2,
            }),
            activeRun: {
                conversationId: "chat-1",
                agentId: "agent-1",
                assistantMessageId: "assistant-1",
                userContent: "hello",
                content: "Old output",
                runId: null,
            },
        });

        expect(resolution).toEqual({
            shouldReset: false,
            recoveredRun: {
                conversationId: "chat-1",
                agentId: "agent-1",
                assistantMessageId: "assistant-1",
                userContent: "hello",
                content: "Old output",
                runId: "run-1",
            },
        });
    });

    test("resets and recovers when the current chat has moved to a different persisted run", () => {
        const resolution = resolveMobileConversationRuntimeSync({
            currentChat: createChat(),
            isMessagesLoading: false,
            messages: [
                createMessage({
                    id: "user-2",
                    role: "user",
                    content: "next prompt",
                    contextContent: "next prompt",
                }),
                createMessage({
                    id: "assistant-2",
                    role: "assistant",
                    content: "Next output",
                    contextContent: "Next output",
                    runId: "run-2",
                }),
            ],
            runtimeState: createRuntimeState({
                phase: "active",
                runId: "run-2",
                assistantMessageId: "assistant-2",
                provider: "codex-default",
                startedAt: 1,
                lastEventAt: 2,
            }),
            activeRun: {
                conversationId: "chat-1",
                assistantMessageId: "assistant-1",
                userContent: "hello",
                content: "Old output",
                runId: "run-1",
            },
        });

        expect(resolution).toEqual({
            shouldReset: true,
            recoveredRun: {
                conversationId: "chat-1",
                agentId: "agent-1",
                assistantMessageId: "assistant-2",
                userContent: "next prompt",
                content: "Next output",
                runId: "run-2",
            },
        });
    });
});
