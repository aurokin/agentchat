import { describe, expect, test } from "bun:test";
import { PassThrough } from "node:stream";

import {
    JsonRpcRequestError,
    JsonlStreamParser,
    JsonRpcStdioClient,
    type RuntimeProcessExit,
    type RuntimeProcessLike,
} from "../runtimeTransport.ts";

describe("JsonlStreamParser", () => {
    test("buffers partial JSON lines", () => {
        const values: unknown[] = [];
        const errors: unknown[] = [];
        const parser = new JsonlStreamParser({
            onValue: (value) => values.push(value),
            onError: (error) => errors.push(error),
        });

        parser.push('{"first":');
        parser.push('true}\n\n{"second":2}');
        parser.end();

        expect(values).toEqual([{ first: true }, { second: 2 }]);
        expect(errors).toEqual([]);
    });

    test("reports malformed JSON lines with raw text", () => {
        const values: unknown[] = [];
        const errors: Array<{ line: string }> = [];
        const parser = new JsonlStreamParser({
            onValue: (value) => values.push(value),
            onError: (error) => errors.push({ line: error.line }),
        });

        parser.push("not-json\n");

        expect(values).toEqual([]);
        expect(errors).toEqual([{ line: "not-json" }]);
    });
});

type JsonRpcMessage = {
    jsonrpc?: string;
    id?: number | string;
    method?: string;
    params?: unknown;
    result?: unknown;
    error?: { code?: number; message: string };
};

type FakePeer = {
    label: string;
    stdin: PassThrough;
    stdout: PassThrough;
    handle: RuntimeProcessLike;
    /** Messages the JsonRpcStdioClient wrote to stdin (parsed). */
    sent: JsonRpcMessage[];
    /** Send a JSON-RPC message back to the client over stdout. */
    send: (message: JsonRpcMessage) => void;
    /** Resolve once `sent` has reached `count` messages. */
    waitForSent: (count: number) => Promise<JsonRpcMessage[]>;
    emitExit: (exit: RuntimeProcessExit) => void;
};

// Minimal RuntimeProcessLike that lets a JsonRpcStdioClient talk to the
// test through PassThrough streams instead of a real subprocess. Real
// ManagedRuntimeProcess behavior (spawn, kill, signal escalation) is
// covered in src/__integration_tests__/runtimeTransport.integration.test.ts.
function createFakePeer(label = "test process"): FakePeer {
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    const exitHandlers = new Set<(exit: RuntimeProcessExit) => void>();
    const sent: JsonRpcMessage[] = [];
    const sentListeners = new Set<() => void>();
    let hasExited = false;
    let isStopping = false;
    const settle = (exit: RuntimeProcessExit) => {
        if (hasExited) return;
        hasExited = true;
        for (const handler of exitHandlers) handler(exit);
    };

    let buffer = "";
    stdin.on("data", (chunk: Buffer) => {
        buffer += chunk.toString();
        let newlineIndex = buffer.indexOf("\n");
        while (newlineIndex !== -1) {
            const line = buffer.slice(0, newlineIndex);
            buffer = buffer.slice(newlineIndex + 1);
            if (line.trim()) {
                sent.push(JSON.parse(line) as JsonRpcMessage);
                for (const listener of [...sentListeners]) listener();
            }
            newlineIndex = buffer.indexOf("\n");
        }
    });

    return {
        label,
        stdin,
        stdout,
        sent,
        send(message) {
            if (hasExited) return;
            stdout.write(`${JSON.stringify(message)}\n`);
        },
        waitForSent(count) {
            if (sent.length >= count) {
                return Promise.resolve(sent.slice(0, count));
            }
            return new Promise((resolve) => {
                const listener = () => {
                    if (sent.length >= count) {
                        sentListeners.delete(listener);
                        resolve(sent.slice(0, count));
                    }
                };
                sentListeners.add(listener);
            });
        },
        emitExit: settle,
        handle: {
            stdin,
            stdout,
            stderr,
            get hasExited() {
                return hasExited;
            },
            get isStopping() {
                return isStopping;
            },
            onExit(handler) {
                exitHandlers.add(handler);
            },
            async stop() {
                isStopping = true;
                if (hasExited) return;
                settle({ type: "exit", code: null, signal: "SIGTERM" });
            },
        },
    };
}

function createClient(peer: FakePeer): JsonRpcStdioClient {
    return new JsonRpcStdioClient({
        process: peer.handle,
        label: peer.label,
    });
}

describe("JsonRpcStdioClient", () => {
    test("sends requests and receives notifications over stdio", async () => {
        const peer = createFakePeer();
        const client = createClient(peer);
        const notifications: unknown[] = [];
        client.onNotification((notification) => {
            notifications.push(notification);
        });

        const requestPromise = client.request("ping", {});
        const [first] = await peer.waitForSent(1);
        expect(first).toEqual({
            jsonrpc: "2.0",
            id: 1,
            method: "ping",
            params: {},
        });

        peer.send({
            id: first?.id,
            result: { ok: true, method: "ping", requests: [first] },
        });
        peer.send({
            method: "runtime/update",
            params: { seen: "ping" },
        });

        await expect(requestPromise).resolves.toEqual({
            ok: true,
            method: "ping",
            requests: [first],
        });
        expect(notifications[0]).toEqual({
            method: "runtime/update",
            params: { seen: "ping" },
        });

        await peer.handle.stop();
    });

    test("rejects pending requests on process exit", async () => {
        const peer = createFakePeer();
        const client = createClient(peer);

        const requestPromise = client.request("hang", {});
        await peer.waitForSent(1);
        peer.emitExit({ type: "exit", code: 8, signal: null });

        await expect(requestPromise).rejects.toThrow(
            "test process exited (8 / null)",
        );
    });

    test("frames outgoing notifications as JSON-RPC 2.0 messages", async () => {
        // Callback-delivery of incoming notifications is covered by
        // "sends requests and receives notifications over stdio" above;
        // this test pins the wire format the client emits via `notify()`.
        const peer = createFakePeer();
        const client = createClient(peer);

        client.notify("session/cancel", { sessionId: "session-1" });
        const [first] = await peer.waitForSent(1);

        expect(first).toEqual({
            jsonrpc: "2.0",
            method: "session/cancel",
            params: { sessionId: "session-1" },
        });

        await peer.handle.stop();
    });

    test("handles incoming JSON-RPC requests", async () => {
        const peer = createFakePeer();
        const client = createClient(peer);
        client.onRequest((request) => {
            expect(request).toEqual({
                id: 99,
                method: "session/request_permission",
                params: { sessionId: "session-1" },
            });
            return { outcome: "cancelled" };
        });

        // Peer issues a request to the client; client should reply on stdin.
        peer.send({
            id: 99,
            method: "session/request_permission",
            params: { sessionId: "session-1" },
        });
        const [reply] = await peer.waitForSent(1);

        expect(reply).toEqual({
            jsonrpc: "2.0",
            id: 99,
            result: { outcome: "cancelled" },
        });

        await peer.handle.stop();
    });

    test("returns JSON-RPC method-not-found errors for unhandled incoming requests", async () => {
        const peer = createFakePeer();
        const client = createClient(peer);

        peer.send({
            jsonrpc: "2.0",
            id: 99,
            method: "session/unsupported",
            params: { sessionId: "session-1" },
        });
        const [reply] = await peer.waitForSent(1);

        expect(reply).toEqual({
            jsonrpc: "2.0",
            id: 99,
            error: {
                code: -32601,
                message:
                    "No handler registered for JSON-RPC request 'session/unsupported'.",
            },
        });

        await peer.handle.stop();
    });

    test("returns JSON-RPC internal errors when incoming request handlers fail", async () => {
        const peer = createFakePeer();
        const client = createClient(peer);
        client.onRequest(() => {
            throw new Error("permission resolver failed");
        });

        peer.send({
            jsonrpc: "2.0",
            id: 99,
            method: "session/request_permission",
            params: { sessionId: "session-1" },
        });
        const [reply] = await peer.waitForSent(1);

        expect(reply).toEqual({
            jsonrpc: "2.0",
            id: 99,
            error: {
                code: -32603,
                message: "permission resolver failed",
            },
        });

        await peer.handle.stop();
    });

    test("preserves explicit JSON-RPC error codes from incoming request handlers", async () => {
        const peer = createFakePeer();
        const client = createClient(peer);
        client.onRequest(() => {
            throw new JsonRpcRequestError(
                -32601,
                "Unsupported ACP request 'session/unsupported'.",
            );
        });

        peer.send({
            jsonrpc: "2.0",
            id: 99,
            method: "session/unsupported",
            params: { sessionId: "session-1" },
        });
        const [reply] = await peer.waitForSent(1);

        expect(reply).toEqual({
            jsonrpc: "2.0",
            id: 99,
            error: {
                code: -32601,
                message: "Unsupported ACP request 'session/unsupported'.",
            },
        });

        await peer.handle.stop();
    });
});
