import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";

import { AcpRuntimeKind } from "../acpRuntimeKind.ts";
import type { AcpProviderConfig, AgentConfig } from "../config.ts";
import type {
    RuntimeProcessExit,
    RuntimeProcessLike,
} from "../runtimeTransport.ts";
import type { RuntimeKindEvent } from "../runtimeKind.ts";

const tempRoots: string[] = [];

afterEach(() => {
    for (const tempRoot of tempRoots.splice(0)) {
        rmSync(tempRoot, { force: true, recursive: true });
    }
});

function createAgent(overrides: Partial<AgentConfig> = {}): AgentConfig {
    return {
        id: "agent-1",
        name: "Agent 1",
        enabled: true,
        defaultVisible: true,
        visibilityOverrides: [],
        rootPath: process.cwd(),
        providerIds: ["acp-test"],
        defaultProviderId: "acp-test",
        modelAllowlist: [],
        variantAllowlist: [],
        tags: [],
        sortOrder: 0,
        workspaceMode: "shared",
        ...overrides,
    };
}

function createProvider(
    overrides: Partial<AcpProviderConfig["acp"]> = {},
): AcpProviderConfig {
    return {
        id: "acp-test",
        kind: "acp",
        label: "ACP Test",
        enabled: true,
        idleTtlSeconds: 60,
        modelCacheTtlSeconds: 60,
        models: [],
        acp: {
            command: "fake-acp",
            args: [],
            baseEnv: {},
            mcpServers: [],
            permissionMode: "fail-closed",
            ...overrides,
        },
    };
}

type JsonRpcMessage = {
    jsonrpc?: string;
    id?: number | string;
    method?: string;
    params?: Record<string, unknown>;
    result?: unknown;
    error?: { code: number; message: string };
};

type FakeAcpAgentConfig = {
    loadSession?: boolean;
    loadSessionError?: string | null;
    promptResult?: boolean;
    promptUpdates?: unknown[];
    includeProcessCwdInAgentInfo?: boolean;
};

// In-process stand-in for the ACP agent subprocess: reads JSON-RPC lines off
// stdin and replies on stdout, exactly as scripts/testing's spawned script
// used to. Lets the runtime kind be exercised without spawning a real
// process (deterministic, no timing races).
function createAcpProcessHarness(config: FakeAcpAgentConfig = {}): {
    factory: (params: {
        command: string;
        args: string[];
        cwd: string;
        env: NodeJS.ProcessEnv;
        stopTimeoutMs?: number;
        onStderr: (chunk: string) => void;
    }) => RuntimeProcessLike;
    handle: () => RuntimeProcessLike;
} {
    let createdHandle: RuntimeProcessLike | null = null;

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
        const settle = (exit: RuntimeProcessExit) => {
            if (hasExited) return;
            hasExited = true;
            for (const handler of exitHandlers) handler(exit);
        };
        const spawnCwd = params.cwd;

        const send = (message: JsonRpcMessage) => {
            if (hasExited) return;
            stdout.write(`${JSON.stringify({ jsonrpc: "2.0", ...message })}\n`);
        };
        const handleLine = (line: string) => {
            if (!line.trim()) return;
            const message = JSON.parse(line) as JsonRpcMessage;
            if (message.method === "initialize") {
                send({
                    id: message.id,
                    result: {
                        protocolVersion: 1,
                        agentCapabilities: {
                            loadSession: config.loadSession ?? true,
                        },
                        agentInfo: {
                            name: "fake-acp",
                            ...(config.includeProcessCwdInAgentInfo
                                ? { cwd: realpathSync(spawnCwd) }
                                : {}),
                        },
                    },
                });
                return;
            }
            if (message.method === "session/new") {
                send({
                    id: message.id,
                    result: { sessionId: "acp-session-1" },
                });
                return;
            }
            if (message.method === "session/load") {
                if (config.loadSessionError) {
                    send({
                        id: message.id,
                        error: {
                            code: -32000,
                            message: config.loadSessionError,
                        },
                    });
                    return;
                }
                send({ id: message.id, result: {} });
                return;
            }
            if (message.method === "session/prompt") {
                const sessionId = message.params?.sessionId;
                for (const update of config.promptUpdates ?? []) {
                    send({
                        method: "session/update",
                        params: { sessionId, update },
                    });
                }
                if (config.promptResult ?? true) {
                    send({
                        id: message.id,
                        result: { stopReason: "end_turn" },
                    });
                }
                return;
            }
            if (message.method === "session/cancel") {
                return;
            }
            send({
                id: message.id,
                error: { code: -32601, message: "unknown" },
            });
        };

        let buffer = "";
        stdin.on("data", (chunk: Buffer) => {
            buffer += chunk.toString();
            let newlineIndex = buffer.indexOf("\n");
            while (newlineIndex !== -1) {
                const line = buffer.slice(0, newlineIndex);
                buffer = buffer.slice(newlineIndex + 1);
                handleLine(line);
                newlineIndex = buffer.indexOf("\n");
            }
        });

        createdHandle = {
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
        // Silence unused-warning on factory params we don't model.
        void params.command;
        void params.args;
        void params.env;
        void params.stopTimeoutMs;
        void params.onStderr;
        return createdHandle;
    };

    return {
        factory,
        handle: () => {
            if (!createdHandle) {
                throw new Error("No ACP process has been launched yet.");
            }
            return createdHandle;
        },
    };
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

describe("AcpRuntimeKind", () => {
    test("starts ACP processes in the agent workspace when provider cwd is omitted", async () => {
        const agentRoot = mkdtempSync(path.join(tmpdir(), "acp-agent-root-"));
        tempRoots.push(agentRoot);
        const harness = createAcpProcessHarness({
            includeProcessCwdInAgentInfo: true,
        });
        const session = new AcpRuntimeKind({
            createRuntimeProcess: harness.factory,
        }).createSession({
            provider: createProvider(),
            agent: createAgent({ rootPath: agentRoot }),
        });

        const initialize = await session.initialize();
        await session.stop();

        expect(initialize.providerEvents?.[0]?.metadata).toMatchObject({
            agentInfo: {
                cwd: realpathSync(agentRoot),
            },
        });
    });

    test("opens ACP sessions and maps prompt updates into runtime events", async () => {
        const harness = createAcpProcessHarness({
            promptUpdates: [
                {
                    sessionUpdate: "agent_message_chunk",
                    content: { type: "text", text: "hello " },
                },
                {
                    sessionUpdate: "tool_call",
                    toolCallId: "tool-1",
                    name: "shell",
                },
            ],
        });
        const session = new AcpRuntimeKind({
            createRuntimeProcess: harness.factory,
        }).createSession({
            provider: createProvider(),
            agent: createAgent(),
        });
        const events: RuntimeKindEvent[] = [];
        session.onEvent((event) => events.push(event));

        const initialize = await session.initialize();
        const opened = await session.openThread({
            bindingProviderId: null,
            bindingThreadId: null,
            providerId: "acp-test",
            modelId: "default",
            cwd: process.cwd(),
        });
        const started = await session.startTurn({
            threadId: opened.threadId,
            inputText: "hello",
            cwd: process.cwd(),
            modelId: "default",
            variantId: "default",
        });

        await waitFor(() =>
            events.some(
                (event) =>
                    event.type === "turn_completed" &&
                    event.status === "completed",
            ),
        );
        await session.stop();

        expect(initialize.providerEvents?.[0]?.eventType).toBe(
            "acp.initialized",
        );
        expect(opened).toMatchObject({
            threadId: "acp-session-1",
            isNew: true,
        });
        expect(started.turnId).toEqual(expect.any(String));
        expect(events).toContainEqual({
            type: "assistant_delta",
            delta: "hello ",
        });
        expect(events).toContainEqual(
            expect.objectContaining({
                type: "provider_event",
                event: expect.objectContaining({
                    eventType: "acp.session.update.tool.call",
                }),
            }),
        );
        expect(events).toContainEqual({
            type: "turn_completed",
            status: "completed",
            errorMessage: undefined,
        });
    });

    test("loads persisted ACP session ids when the agent advertises loadSession", async () => {
        const harness = createAcpProcessHarness({ loadSession: true });
        const session = new AcpRuntimeKind({
            createRuntimeProcess: harness.factory,
        }).createSession({
            provider: createProvider(),
            agent: createAgent(),
        });

        await session.initialize();
        const opened = await session.openThread({
            bindingProviderId: "acp-test",
            bindingThreadId: "persisted-session",
            providerId: "acp-test",
            modelId: "default",
            cwd: process.cwd(),
        });
        await session.stop();

        expect(opened).toMatchObject({
            threadId: "persisted-session",
            isNew: false,
        });
        expect(opened.providerEvents?.[0]?.eventType).toBe(
            "acp.session.loaded",
        );
    });

    test("falls back to a fresh ACP session when persisted session load fails", async () => {
        const harness = createAcpProcessHarness({
            loadSession: true,
            loadSessionError: "session not found",
        });
        const session = new AcpRuntimeKind({
            createRuntimeProcess: harness.factory,
        }).createSession({
            provider: createProvider(),
            agent: createAgent(),
        });

        await session.initialize();
        const opened = await session.openThread({
            bindingProviderId: "acp-test",
            bindingThreadId: "stale-session",
            providerId: "acp-test",
            modelId: "default",
            cwd: process.cwd(),
        });
        await session.stop();

        expect(opened).toMatchObject({
            threadId: "acp-session-1",
            isNew: true,
        });
        expect(opened.providerEvents?.[0]).toMatchObject({
            eventType: "acp.session.load-failed",
            metadata: {
                previousSessionId: "stale-session",
                errorMessage: expect.stringContaining("session not found"),
            },
        });
    });

    test("stops the ACP process when cancel does not settle the prompt", async () => {
        const harness = createAcpProcessHarness({
            promptResult: false,
            promptUpdates: [
                {
                    sessionUpdate: "agent_message_chunk",
                    content: { type: "text", text: "working" },
                },
            ],
        });
        const session = new AcpRuntimeKind({
            createRuntimeProcess: harness.factory,
        }).createSession({
            provider: createProvider({ timeoutMs: 10 }),
            agent: createAgent(),
        });
        const events: RuntimeKindEvent[] = [];
        session.onEvent((event) => events.push(event));

        await session.initialize();
        const opened = await session.openThread({
            bindingProviderId: null,
            bindingThreadId: null,
            providerId: "acp-test",
            modelId: "default",
            cwd: process.cwd(),
        });
        const started = await session.startTurn({
            threadId: opened.threadId,
            inputText: "stop",
            cwd: process.cwd(),
            modelId: "default",
            variantId: "default",
        });
        await session.interruptTurn({
            threadId: opened.threadId,
            turnId: started.turnId,
        });

        await waitFor(() =>
            events.some(
                (event) =>
                    event.type === "turn_completed" &&
                    event.status === "interrupted",
            ),
        );

        expect(events).toContainEqual(
            expect.objectContaining({
                type: "provider_event",
                event: expect.objectContaining({
                    eventType: "acp.session.cancel.sent",
                }),
            }),
        );
        expect(events).toContainEqual({
            type: "turn_completed",
            status: "interrupted",
            errorMessage: undefined,
        });
    });

    test("reports hung ACP prompts as timeout failures", async () => {
        const harness = createAcpProcessHarness({
            promptResult: false,
            promptUpdates: [
                {
                    sessionUpdate: "agent_message_chunk",
                    content: { type: "text", text: "working" },
                },
            ],
        });
        const session = new AcpRuntimeKind({
            createRuntimeProcess: harness.factory,
        }).createSession({
            provider: createProvider({ timeoutMs: 10 }),
            agent: createAgent(),
        });
        const events: RuntimeKindEvent[] = [];
        session.onEvent((event) => events.push(event));

        await session.initialize();
        const opened = await session.openThread({
            bindingProviderId: null,
            bindingThreadId: null,
            providerId: "acp-test",
            modelId: "default",
            cwd: process.cwd(),
        });
        await session.startTurn({
            threadId: opened.threadId,
            inputText: "timeout",
            cwd: process.cwd(),
            modelId: "default",
            variantId: "default",
        });

        await waitFor(() =>
            events.some(
                (event) =>
                    event.type === "turn_completed" &&
                    event.status === "errored",
            ),
        );

        expect(events).toContainEqual(
            expect.objectContaining({
                type: "provider_event",
                event: expect.objectContaining({
                    eventType: "acp.session.prompt.timed-out",
                }),
            }),
        );
        expect(events).toContainEqual({
            type: "turn_completed",
            status: "errored",
            errorMessage: "ACP prompt timed out after 10ms.",
        });
    });
});
