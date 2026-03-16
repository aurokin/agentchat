import { afterEach, describe, expect, mock, test } from "bun:test";

import {
    AgentchatSocketClient,
    toAgentchatWebSocketUrl,
    type AgentchatSocketEvent,
} from "../agentchat-socket";

class FakeWebSocket {
    static instances: FakeWebSocket[] = [];

    static reset() {
        FakeWebSocket.instances = [];
    }

    readonly readyState = FakeWebSocket.OPEN;
    onopen: (() => void) | null = null;
    onmessage: ((event: { data: string }) => void) | null = null;
    onerror: (() => void) | null = null;
    onclose: (() => void) | null = null;
    readonly sentMessages: string[] = [];

    static readonly OPEN = 1;

    constructor(public readonly url: URL) {
        FakeWebSocket.instances.push(this);
    }

    send(message: string): void {
        this.sentMessages.push(message);
    }

    close(): void {
        this.onclose?.();
    }

    emitOpen() {
        this.onopen?.();
    }

    emitError() {
        this.onerror?.();
    }

    emitEvent(event: AgentchatSocketEvent) {
        this.onmessage?.({
            data: JSON.stringify(event),
        });
    }
}

const originalWebSocket = globalThis.WebSocket;

afterEach(() => {
    FakeWebSocket.reset();
    globalThis.WebSocket = originalWebSocket;
});

describe("agentchat socket helpers", () => {
    test("maps http urls to websocket urls", () => {
        expect(toAgentchatWebSocketUrl("http://localhost:3030")).toBe(
            "ws://localhost:3030/ws",
        );
    });

    test("maps https urls to secure websocket urls", () => {
        expect(
            toAgentchatWebSocketUrl("https://agentchat.example.com/base/path"),
        ).toBe("wss://agentchat.example.com/ws");
    });

    test("emits connection.reconnected only after an unexpected disconnect", async () => {
        globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;

        const client = new AgentchatSocketClient({
            getWebSocketUrl: () => "ws://localhost:3030/ws",
            createId: () => "id-1",
            notConfiguredMessage: "missing",
        });
        const events: string[] = [];
        client.subscribe((event) => {
            events.push(event.type);
        });

        const connectPromise = client.ensureConnected(async () => "token-1");
        await Promise.resolve();
        const firstSocket = FakeWebSocket.instances[0];
        if (!firstSocket) {
            throw new Error("Expected the first websocket connection");
        }
        firstSocket.emitOpen();
        firstSocket.emitEvent({
            type: "connection.ready",
            payload: {
                user: {
                    sub: "sub-1",
                    userId: "user-1",
                    email: "user@example.com",
                },
                transport: "websocket",
            },
        });
        await connectPromise;

        firstSocket.emitEvent({
            type: "run.started",
            payload: {
                conversationId: "chat-1",
                runId: "run-1",
                messageId: "assistant-1",
            },
        });
        firstSocket.close();

        await Bun.sleep(600);

        const secondSocket = FakeWebSocket.instances[1];
        if (!secondSocket) {
            throw new Error("Expected a reconnect websocket connection");
        }
        secondSocket.emitOpen();
        secondSocket.emitEvent({
            type: "connection.ready",
            payload: {
                user: {
                    sub: "sub-1",
                    userId: "user-1",
                    email: "user@example.com",
                },
                transport: "websocket",
            },
        });

        await Bun.sleep(0);

        expect(events).toEqual([
            "connection.ready",
            "run.started",
            "connection.ready",
            "connection.reconnected",
        ]);
    });

    test("does not reconnect after an explicit close cancels a pending retry", async () => {
        globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;

        const client = new AgentchatSocketClient({
            getWebSocketUrl: () => "ws://localhost:3030/ws",
            createId: () => "id-1",
            notConfiguredMessage: "missing",
        });

        const connectPromise = client.ensureConnected(async () => "token-1");
        await Promise.resolve();
        const firstSocket = FakeWebSocket.instances[0];
        if (!firstSocket) {
            throw new Error("Expected the first websocket connection");
        }
        firstSocket.emitOpen();
        firstSocket.emitEvent({
            type: "connection.ready",
            payload: {
                user: {
                    sub: "sub-1",
                    userId: "user-1",
                    email: "user@example.com",
                },
                transport: "websocket",
            },
        });
        await connectPromise;

        firstSocket.close();
        client.close();

        await Bun.sleep(600);

        expect(FakeWebSocket.instances).toHaveLength(1);
    });

    test("reference counts conversation subscriptions across multiple owners", async () => {
        globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;

        const client = new AgentchatSocketClient({
            getWebSocketUrl: () => "ws://localhost:3030/ws",
            createId: () => "id-1",
            notConfiguredMessage: "missing",
        });

        const connectPromise = client.ensureConnected(async () => "token-1");
        await Promise.resolve();
        const socket = FakeWebSocket.instances[0];
        if (!socket) {
            throw new Error("Expected a websocket connection");
        }
        socket.emitOpen();
        socket.emitEvent({
            type: "connection.ready",
            payload: {
                user: {
                    sub: "sub-1",
                    userId: "user-1",
                    email: "user@example.com",
                },
                transport: "websocket",
            },
        });
        await connectPromise;

        const unsubscribeA = client.subscribeToConversation("chat-1");
        const unsubscribeB = client.subscribeToConversation("chat-1");

        expect(
            socket.sentMessages.filter((message) =>
                message.includes('"type":"conversation.subscribe"'),
            ),
        ).toHaveLength(1);

        unsubscribeA();
        expect(
            socket.sentMessages.filter((message) =>
                message.includes('"type":"conversation.unsubscribe"'),
            ),
        ).toHaveLength(0);

        unsubscribeB();
        expect(
            socket.sentMessages.filter((message) =>
                message.includes('"type":"conversation.unsubscribe"'),
            ),
        ).toHaveLength(1);
    });

    test("replays subscriptions that were requested before the first socket became ready", async () => {
        globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;

        const client = new AgentchatSocketClient({
            getWebSocketUrl: () => "ws://localhost:3030/ws",
            createId: () => "id-1",
            notConfiguredMessage: "missing",
        });

        const connectPromise = client.ensureConnected(async () => "token-1");
        await Promise.resolve();
        const firstSocket = FakeWebSocket.instances[0];
        if (!firstSocket) {
            throw new Error("Expected the first websocket connection");
        }

        client.subscribeToConversation("chat-1");
        expect(
            firstSocket.sentMessages.filter((message) =>
                message.includes('"type":"conversation.subscribe"'),
            ),
        ).toHaveLength(0);

        firstSocket.emitOpen();
        firstSocket.emitEvent({
            type: "connection.ready",
            payload: {
                user: {
                    sub: "sub-1",
                    userId: "user-1",
                    email: "user@example.com",
                },
                transport: "websocket",
            },
        });
        await connectPromise;

        expect(
            firstSocket.sentMessages.filter((message) =>
                message.includes('"type":"conversation.subscribe"'),
            ),
        ).toHaveLength(1);
        expect(firstSocket.sentMessages.join("\n")).toContain(
            '"conversationId":"chat-1"',
        );
    });

    test("replays active conversation subscriptions after reconnect", async () => {
        globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;

        const client = new AgentchatSocketClient({
            getWebSocketUrl: () => "ws://localhost:3030/ws",
            createId: () => "id-1",
            notConfiguredMessage: "missing",
        });

        const connectPromise = client.ensureConnected(async () => "token-1");
        await Promise.resolve();
        const firstSocket = FakeWebSocket.instances[0];
        if (!firstSocket) {
            throw new Error("Expected the first websocket connection");
        }
        firstSocket.emitOpen();
        firstSocket.emitEvent({
            type: "connection.ready",
            payload: {
                user: {
                    sub: "sub-1",
                    userId: "user-1",
                    email: "user@example.com",
                },
                transport: "websocket",
            },
        });
        await connectPromise;

        client.subscribeToConversation("chat-1");
        client.subscribeToConversation("chat-2");

        expect(
            firstSocket.sentMessages.filter((message) =>
                message.includes('"type":"conversation.subscribe"'),
            ),
        ).toHaveLength(2);

        firstSocket.close();

        await Bun.sleep(600);

        const secondSocket = FakeWebSocket.instances[1];
        if (!secondSocket) {
            throw new Error("Expected a reconnect websocket connection");
        }
        secondSocket.emitOpen();
        secondSocket.emitEvent({
            type: "connection.ready",
            payload: {
                user: {
                    sub: "sub-1",
                    userId: "user-1",
                    email: "user@example.com",
                },
                transport: "websocket",
            },
        });

        await Bun.sleep(0);

        const resubscribeMessages = secondSocket.sentMessages.filter((message) =>
            message.includes('"type":"conversation.subscribe"'),
        );
        expect(resubscribeMessages).toHaveLength(2);
        expect(resubscribeMessages.join("\n")).toContain('"conversationId":"chat-1"');
        expect(resubscribeMessages.join("\n")).toContain('"conversationId":"chat-2"');
    });

    test("does not replay subscriptions that were removed during a reconnect gap", async () => {
        globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;

        const client = new AgentchatSocketClient({
            getWebSocketUrl: () => "ws://localhost:3030/ws",
            createId: () => "id-1",
            notConfiguredMessage: "missing",
        });

        const connectPromise = client.ensureConnected(async () => "token-1");
        await Promise.resolve();
        const firstSocket = FakeWebSocket.instances[0];
        if (!firstSocket) {
            throw new Error("Expected the first websocket connection");
        }
        firstSocket.emitOpen();
        firstSocket.emitEvent({
            type: "connection.ready",
            payload: {
                user: {
                    sub: "sub-1",
                    userId: "user-1",
                    email: "user@example.com",
                },
                transport: "websocket",
            },
        });
        await connectPromise;

        const unsubscribe = client.subscribeToConversation("chat-1");
        expect(
            firstSocket.sentMessages.filter((message) =>
                message.includes('"type":"conversation.subscribe"'),
            ),
        ).toHaveLength(1);

        firstSocket.close();
        unsubscribe();

        await Bun.sleep(600);

        const secondSocket = FakeWebSocket.instances[1];
        if (!secondSocket) {
            throw new Error("Expected a reconnect websocket connection");
        }
        secondSocket.emitOpen();
        secondSocket.emitEvent({
            type: "connection.ready",
            payload: {
                user: {
                    sub: "sub-1",
                    userId: "user-1",
                    email: "user@example.com",
                },
                transport: "websocket",
            },
        });

        await Bun.sleep(0);

        expect(
            secondSocket.sentMessages.filter((message) =>
                message.includes('"type":"conversation.subscribe"'),
            ),
        ).toHaveLength(0);
    });

    test("keeps the pending reconnect event through failed reconnect attempts", async () => {
        globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;

        const originalConsoleError = console.error;
        console.error = mock(() => undefined) as typeof console.error;

        try {
            const client = new AgentchatSocketClient({
                getWebSocketUrl: () => "ws://localhost:3030/ws",
                createId: () => "id-1",
                notConfiguredMessage: "missing",
            });
            const events: string[] = [];
            client.subscribe((event) => {
                events.push(event.type);
            });

            const connectPromise = client.ensureConnected(async () => "token-1");
            await Promise.resolve();
            const firstSocket = FakeWebSocket.instances[0];
            if (!firstSocket) {
                throw new Error("Expected the first websocket connection");
            }
            firstSocket.emitOpen();
            firstSocket.emitEvent({
                type: "connection.ready",
                payload: {
                    user: {
                        sub: "sub-1",
                        userId: "user-1",
                        email: "user@example.com",
                    },
                    transport: "websocket",
                },
            });
            await connectPromise;

            firstSocket.close();

            await Bun.sleep(600);

            const secondSocket = FakeWebSocket.instances[1];
            if (!secondSocket) {
                throw new Error("Expected the failed reconnect websocket");
            }
            secondSocket.emitError();
            secondSocket.close();

            await Bun.sleep(1100);

            const thirdSocket = FakeWebSocket.instances[2];
            if (!thirdSocket) {
                throw new Error("Expected the recovered reconnect websocket");
            }
            thirdSocket.emitOpen();
            thirdSocket.emitEvent({
                type: "connection.ready",
                payload: {
                    user: {
                        sub: "sub-1",
                        userId: "user-1",
                        email: "user@example.com",
                    },
                    transport: "websocket",
                },
            });

            await Bun.sleep(0);

            expect(events).toEqual([
                "connection.ready",
                "connection.ready",
                "connection.reconnected",
            ]);
        } finally {
            console.error = originalConsoleError;
        }
    });
});
