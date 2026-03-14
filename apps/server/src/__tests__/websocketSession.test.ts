import { describe, expect, mock, test } from "bun:test";

import {
    handleConnectedSocketMessage,
    handleSocketClose,
    normalizeSocketMessage,
    type RuntimeManagerLike,
} from "../websocketSession.ts";

const session = {
    sub: "sub-1",
    userId: "user-1",
    email: "user@example.com",
    iat: 1,
    exp: 2,
};

function createRuntimeManager() {
    return {
        subscribe: mock(() => undefined),
        unsubscribe: mock(() => undefined),
        interrupt: mock(async () => undefined),
        sendMessage: mock(async () => undefined),
    };
}

describe("websocketSession", () => {
    test("normalizes ArrayBuffer websocket payloads", () => {
        const encoded = new TextEncoder().encode("hello");
        expect(normalizeSocketMessage(encoded.buffer)).toBe("hello");
    });

    test("routes subscribe commands to runtimeManager.subscribe", async () => {
        const runtimeManager = createRuntimeManager();
        const sendJson = mock(() => undefined);

        await handleConnectedSocketMessage({
            runtimeManager,
            session,
            connectionId: "socket-1",
            rawMessage: JSON.stringify({
                id: "cmd-1",
                type: "conversation.subscribe",
                payload: {
                    conversationId: "chat-1",
                },
            }),
            sendJson,
        });

        expect(runtimeManager.subscribe).toHaveBeenCalledTimes(1);
        expect(runtimeManager.subscribe).toHaveBeenCalledWith(
            expect.objectContaining({
                userSub: "sub-1",
                conversationId: "chat-1",
                subscriberId: "socket-1",
                sendEvent: expect.any(Function),
            }),
        );
        expect(sendJson).not.toHaveBeenCalled();
    });

    test("serializes subscribed runtime events back to the socket client", async () => {
        const runtimeManager = createRuntimeManager();
        const sendJson = mock(() => undefined);

        await handleConnectedSocketMessage({
            runtimeManager,
            session,
            connectionId: "socket-1",
            rawMessage: JSON.stringify({
                id: "cmd-1",
                type: "conversation.subscribe",
                payload: {
                    conversationId: "chat-1",
                },
            }),
            sendJson,
        });

        const subscribeCalls = runtimeManager.subscribe.mock
            .calls as unknown as Array<
            [Parameters<RuntimeManagerLike["subscribe"]>[0]]
        >;
        const subscribeCall = subscribeCalls[0]?.[0];
        if (!subscribeCall) {
            throw new Error("Expected subscribe call");
        }

        subscribeCall.sendEvent({
            type: "run.started",
            payload: {
                conversationId: "chat-1",
                runId: "run-1",
                messageId: "assistant-1",
            },
        });

        expect(sendJson).toHaveBeenCalledWith(
            JSON.stringify({
                type: "run.started",
                payload: {
                    conversationId: "chat-1",
                    runId: "run-1",
                    messageId: "assistant-1",
                },
            }),
        );
    });

    test("routes interrupt commands to runtimeManager.interrupt", async () => {
        const runtimeManager = createRuntimeManager();

        await handleConnectedSocketMessage({
            runtimeManager,
            session,
            connectionId: "socket-1",
            rawMessage: JSON.stringify({
                id: "cmd-2",
                type: "conversation.interrupt",
                payload: {
                    conversationId: "chat-1",
                },
            }),
            sendJson: () => undefined,
        });

        expect(runtimeManager.interrupt).toHaveBeenCalledTimes(1);
        expect(runtimeManager.interrupt).toHaveBeenCalledWith({
            userSub: "sub-1",
            conversationId: "chat-1",
        });
    });

    test("routes unsubscribe commands to runtimeManager.unsubscribe", async () => {
        const runtimeManager = createRuntimeManager();

        await handleConnectedSocketMessage({
            runtimeManager,
            session,
            connectionId: "socket-1",
            rawMessage: JSON.stringify({
                id: "cmd-2b",
                type: "conversation.unsubscribe",
                payload: {
                    conversationId: "chat-1",
                },
            }),
            sendJson: () => undefined,
        });

        expect(runtimeManager.unsubscribe).toHaveBeenCalledTimes(1);
        expect(runtimeManager.unsubscribe).toHaveBeenCalledWith({
            subscriberId: "socket-1",
            conversationId: "chat-1",
        });
    });

    test("routes send commands to runtimeManager.sendMessage", async () => {
        const runtimeManager = createRuntimeManager();

        await handleConnectedSocketMessage({
            runtimeManager,
            session,
            connectionId: "socket-1",
            rawMessage: JSON.stringify({
                id: "cmd-3",
                type: "conversation.send",
                payload: {
                    conversationId: "chat-1",
                    agentId: "agent-1",
                    modelId: "gpt-5.3-codex",
                    variantId: "balanced",
                    thinking: "medium",
                    content: "Hello",
                    userMessageId: "user-1",
                    assistantMessageId: "assistant-1",
                    history: [],
                },
            }),
            sendJson: () => undefined,
        });

        expect(runtimeManager.sendMessage).toHaveBeenCalledTimes(1);
        expect(runtimeManager.sendMessage).toHaveBeenCalledWith(
            expect.objectContaining({
                userSub: "sub-1",
                userId: "user-1",
                subscriberId: "socket-1",
                sendEvent: expect.any(Function),
            }),
        );
    });

    test("parses typed-array websocket payloads through the full command path", async () => {
        const runtimeManager = createRuntimeManager();
        const rawMessage = new TextEncoder().encode(
            JSON.stringify({
                id: "cmd-3b",
                type: "conversation.send",
                payload: {
                    conversationId: "chat-1",
                    agentId: "agent-1",
                    modelId: "gpt-5.3-codex",
                    variantId: "balanced",
                    thinking: "medium",
                    content: "Hello",
                    userMessageId: "user-1",
                    assistantMessageId: "assistant-1",
                    history: [],
                },
            }),
        );

        await handleConnectedSocketMessage({
            runtimeManager,
            session,
            connectionId: "socket-1",
            rawMessage,
            sendJson: () => undefined,
        });

        expect(runtimeManager.sendMessage).toHaveBeenCalledTimes(1);
    });

    test("sends connection.error events for invalid command payloads", async () => {
        const runtimeManager = createRuntimeManager();
        const sendJson = mock(() => undefined);

        await handleConnectedSocketMessage({
            runtimeManager,
            session,
            connectionId: "socket-1",
            rawMessage: JSON.stringify({
                id: "cmd-4",
                type: "conversation.send",
                payload: {
                    conversationId: "chat-1",
                },
            }),
            sendJson,
        });

        expect(sendJson).toHaveBeenCalledTimes(1);
        expect(sendJson).toHaveBeenCalledWith(
            expect.stringContaining('"type":"connection.error"'),
        );
        expect(sendJson).toHaveBeenCalledWith(
            expect.stringContaining("Invalid send payload"),
        );
    });

    test("sends connection.error events when runtimeManager.sendMessage throws", async () => {
        const runtimeManager = createRuntimeManager();
        runtimeManager.sendMessage = mock(async () => {
            throw new Error("runtime failed");
        });
        const sendJson = mock(() => undefined);

        await handleConnectedSocketMessage({
            runtimeManager,
            session,
            connectionId: "socket-1",
            rawMessage: JSON.stringify({
                id: "cmd-5",
                type: "conversation.send",
                payload: {
                    conversationId: "chat-1",
                    agentId: "agent-1",
                    modelId: "gpt-5.3-codex",
                    variantId: null,
                    thinking: "medium",
                    content: "Hello",
                    userMessageId: "user-1",
                    assistantMessageId: "assistant-1",
                    history: [],
                },
            }),
            sendJson,
        });

        expect(sendJson).toHaveBeenCalledTimes(1);
        expect(sendJson).toHaveBeenCalledWith(
            expect.stringContaining("runtime failed"),
        );
    });

    test("cleans up runtime subscriptions on socket close", () => {
        const runtimeManager = createRuntimeManager();

        handleSocketClose({
            runtimeManager,
            connectionId: "socket-1",
        });

        expect(runtimeManager.unsubscribe).toHaveBeenCalledTimes(1);
        expect(runtimeManager.unsubscribe).toHaveBeenCalledWith({
            subscriberId: "socket-1",
        });
    });
});
