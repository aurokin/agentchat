import { describe, expect, mock, test } from "bun:test";
import { PassThrough } from "node:stream";

import { CodexAppServerClient } from "../codexAppServerClient.ts";
import type { AgentConfig, CodexProviderConfig } from "../config.ts";
import type {
    RuntimeProcessExit,
    RuntimeProcessLike,
} from "../runtimeTransport.ts";

function createProvider(): CodexProviderConfig {
    return {
        id: "codex-test",
        kind: "codex",
        label: "Codex Test",
        enabled: true,
        idleTtlSeconds: 60,
        modelCacheTtlSeconds: 60,
        models: [],
        codex: {
            command: "codex",
            args: [],
            baseEnv: {},
            cwd: process.cwd(),
        },
    };
}

function createAgent(): AgentConfig {
    return {
        id: "agent-1",
        name: "Agent 1",
        enabled: true,
        defaultVisible: true,
        visibilityOverrides: [],
        rootPath: process.cwd(),
        providerIds: ["codex-test"],
        defaultProviderId: "codex-test",
        modelAllowlist: [],
        variantAllowlist: [],
        tags: [],
        sortOrder: 0,
        workspaceMode: "shared",
    };
}

type JsonRpcMessage = {
    jsonrpc?: string;
    id?: number | string;
    method?: string;
    params?: unknown;
    result?: unknown;
    error?: { code?: number; message: string };
};

type FakeCodexProcess = {
    stdout: PassThrough;
    stderr: PassThrough;
    stopTimeoutMs: number | undefined;
    onStderr: (chunk: string) => void;
    onRequest: (handler: (message: JsonRpcMessage) => void) => void;
    send: (message: JsonRpcMessage) => void;
    writeRaw: (text: string) => void;
    emitExit: (exit: RuntimeProcessExit) => void;
    handle: RuntimeProcessLike;
};

// In-process stand-in for the codex app-server subprocess: reads JSON-RPC
// lines off stdin and lets the test reply on stdout. Replaces the
// process.execPath-spawned readline scripts so the client is exercised
// deterministically without a real process.
function createCodexProcessHarness(): {
    factory: (params: {
        command: string;
        args: string[];
        cwd: string;
        env: NodeJS.ProcessEnv;
        stopTimeoutMs?: number;
        onStderr: (chunk: string) => void;
    }) => RuntimeProcessLike;
    process: () => FakeCodexProcess;
} {
    let created: FakeCodexProcess | null = null;

    const factory = (params: {
        command: string;
        args: string[];
        cwd: string;
        env: NodeJS.ProcessEnv;
        stopTimeoutMs?: number;
        onStderr: (chunk: string) => void;
    }): RuntimeProcessLike => {
        const stdin = new PassThrough();
        const stdout = new PassThrough();
        const stderr = new PassThrough();
        const exitHandlers = new Set<(exit: RuntimeProcessExit) => void>();
        let hasExited = false;
        let isStopping = false;
        let requestHandler: ((message: JsonRpcMessage) => void) | null = null;
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
                    requestHandler?.(JSON.parse(line) as JsonRpcMessage);
                }
                newlineIndex = buffer.indexOf("\n");
            }
        });

        const handle: RuntimeProcessLike = {
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
        };

        created = {
            stdout,
            stderr,
            stopTimeoutMs: params.stopTimeoutMs,
            onStderr: params.onStderr,
            onRequest(handler) {
                requestHandler = handler;
            },
            send(message) {
                if (hasExited) return;
                stdout.write(`${JSON.stringify(message)}\n`);
            },
            writeRaw(text) {
                if (hasExited) return;
                stdout.write(text);
            },
            emitExit: settle,
            handle,
        };
        // We model only the params the client passes through.
        void params.command;
        void params.args;
        void params.cwd;
        void params.env;
        return handle;
    };

    return {
        factory,
        process: () => {
            if (!created) {
                throw new Error("No codex process has been launched yet.");
            }
            return created;
        },
    };
}

function createClient(
    harness: ReturnType<typeof createCodexProcessHarness>,
    stopTimeoutMs?: number,
): CodexAppServerClient {
    return new CodexAppServerClient({
        provider: createProvider(),
        agent: createAgent(),
        stopTimeoutMs,
        createRuntimeProcess: harness.factory,
    });
}

async function waitFor(condition: () => boolean): Promise<void> {
    const deadline = Date.now() + 1_000;
    while (!condition()) {
        if (Date.now() > deadline) {
            throw new Error("Timed out waiting for test condition.");
        }
        await new Promise((resolve) => setImmediate(resolve));
    }
}

describe("CodexAppServerClient", () => {
    test("passes the configured stop timeout through to the process", () => {
        const harness = createCodexProcessHarness();
        createClient(harness, 1_234);
        expect(harness.process().stopTimeoutMs).toBe(1_234);
    });

    test("resolves JSON-RPC request responses", async () => {
        const harness = createCodexProcessHarness();
        const client = createClient(harness);
        harness.process().onRequest((message) => {
            harness.process().send({
                id: message.id,
                result: { method: message.method, params: message.params },
            });
        });

        await expect(client.request("ping", { value: 42 })).resolves.toEqual({
            method: "ping",
            params: { value: 42 },
        });

        await client.stop();
    });

    test("rejects JSON-RPC error responses", async () => {
        const harness = createCodexProcessHarness();
        const client = createClient(harness);
        harness.process().onRequest((message) => {
            harness.process().send({
                id: message.id,
                error: { message: "request failed" },
            });
        });

        await expect(client.request("fail", {})).rejects.toThrow(
            "request failed",
        );

        await client.stop();
    });

    test("delivers JSON-RPC notifications", async () => {
        const harness = createCodexProcessHarness();
        const client = createClient(harness);
        const notifications: unknown[] = [];
        client.onNotification((notification) => {
            notifications.push(notification);
        });

        harness.process().send({
            method: "codex/event/test",
            params: { ok: true },
        });
        await waitFor(() => notifications.length === 1);

        expect(notifications[0]).toEqual({
            method: "codex/event/test",
            params: { ok: true },
        });

        await client.stop();
    });

    test("logs invalid JSON without closing the client", async () => {
        const consoleError = mock(() => undefined);
        const originalConsoleError = console.error;
        console.error = consoleError as typeof console.error;
        try {
            const harness = createCodexProcessHarness();
            const client = createClient(harness);
            harness.process().writeRaw("not-json\n");

            await waitFor(() => consoleError.mock.calls.length > 0);
            const calls = consoleError.mock.calls as unknown[][];
            expect(calls[0]?.[0]).toBe("[agentchat-server] invalid codex JSON");

            await client.stop();
        } finally {
            console.error = originalConsoleError;
        }
    });

    test("rejects pending requests when the child exits", async () => {
        const harness = createCodexProcessHarness();
        const client = createClient(harness);
        harness.process().onRequest(() => {
            harness.process().emitExit({ type: "exit", code: 7, signal: null });
        });

        await expect(client.request("hang", {})).rejects.toThrow(
            "Codex app-server exited (7 / null)",
        );

        await client.stop();
    });

    test("logs trimmed stderr chunks with a codex prefix", async () => {
        const consoleError = mock(() => undefined);
        const originalConsoleError = console.error;
        console.error = consoleError as typeof console.error;
        try {
            const harness = createCodexProcessHarness();
            const client = createClient(harness);
            harness.process().onStderr("  panic: boom\n");

            const calls = consoleError.mock.calls as unknown[][];
            expect(calls[0]?.[0]).toBe("[agentchat-server][codex] panic: boom");

            // Whitespace-only chunks are dropped.
            harness.process().onStderr("   \n");
            expect(consoleError.mock.calls.length).toBe(1);

            await client.stop();
        } finally {
            console.error = originalConsoleError;
        }
    });
});
