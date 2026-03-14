import { afterEach, describe, expect, test } from "bun:test";

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

    static readonly OPEN = 1;

    constructor(public readonly url: URL) {
        FakeWebSocket.instances.push(this);
    }

    send(): void {}

    close(): void {
        this.onclose?.();
    }

    emitOpen() {
        this.onopen?.();
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
});
