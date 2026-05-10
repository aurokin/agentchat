import { describe, expect, test } from "bun:test";
import { PassThrough } from "node:stream";

import { ClaudeCodeRuntimeKind } from "../claudeCodeRuntimeKind.ts";
import type {
    AgentConfig,
    ClaudeCodeProviderConfig,
    ProviderConfig,
} from "../config.ts";
import type {
    RuntimeProcessExit,
    RuntimeProcessLike,
    RuntimeProcessStopPolicy,
} from "../runtimeTransport.ts";
import type { RuntimeKindEvent } from "../runtimeKind.ts";

function createAgent(): AgentConfig {
    return {
        id: "agent-1",
        name: "Agent 1",
        enabled: true,
        defaultVisible: true,
        visibilityOverrides: [],
        rootPath: process.cwd(),
        providerIds: ["claude-test"],
        defaultProviderId: "claude-test",
        modelAllowlist: [],
        variantAllowlist: [],
        tags: [],
        sortOrder: 0,
        workspaceMode: "shared",
    };
}

function createProvider(
    overrides: Partial<ClaudeCodeProviderConfig["claudeCode"]> = {},
): ClaudeCodeProviderConfig {
    return {
        id: "claude-test",
        kind: "claude-code",
        label: "Claude Test",
        enabled: true,
        idleTtlSeconds: 60,
        modelCacheTtlSeconds: 60,
        models: [],
        claudeCode: {
            command: "claude",
            args: [],
            baseEnv: {},
            cwd: process.cwd(),
            permissionMode: "auto",
            ...overrides,
        },
    };
}

type FakeProcess = {
    stdin: PassThrough;
    stdout: PassThrough;
    stderr: PassThrough;
    args: string[];
    cwd: string;
    stopPolicy: RuntimeProcessStopPolicy | undefined;
    pushStderr: (chunk: string) => void;
    emitExit: (exit: RuntimeProcessExit) => void;
    handle: RuntimeProcessLike;
    onStopped: () => boolean;
};

type ProcessHarness = {
    factory: (params: {
        command: string;
        args: string[];
        cwd: string;
        env: NodeJS.ProcessEnv;
        stopTimeoutMs?: number;
        stopPolicy?: RuntimeProcessStopPolicy;
        onStderr: (chunk: string) => void;
    }) => RuntimeProcessLike;
    processes: FakeProcess[];
    last: () => FakeProcess;
    waitForLaunch: (index: number) => Promise<FakeProcess>;
};

function createProcessHarness(): ProcessHarness {
    const processes: FakeProcess[] = [];
    const launchListeners = new Set<() => void>();

    const factory: ProcessHarness["factory"] = (params) => {
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
        const fake: FakeProcess = {
            stdin,
            stdout,
            stderr,
            args: params.args,
            cwd: params.cwd,
            stopPolicy: params.stopPolicy,
            pushStderr: (chunk) => params.onStderr(chunk),
            emitExit: settle,
            handle,
            onStopped: () => isStopping,
        };
        processes.push(fake);
        for (const listener of [...launchListeners]) listener();
        return handle;
    };

    const last = () => {
        const proc = processes[processes.length - 1];
        if (!proc) throw new Error("No process has been launched yet.");
        return proc;
    };

    const waitForLaunch = (index: number): Promise<FakeProcess> => {
        if (processes[index]) return Promise.resolve(processes[index]);
        return new Promise((resolve) => {
            const listener = () => {
                if (processes[index]) {
                    launchListeners.delete(listener);
                    resolve(processes[index]);
                }
            };
            launchListeners.add(listener);
        });
    };

    return { factory, processes, last, waitForLaunch };
}

function emitJsonl(stream: PassThrough, lines: unknown[]): void {
    stream.end(lines.map((line) => `${JSON.stringify(line)}\n`).join(""));
}

async function flush(): Promise<void> {
    for (let i = 0; i < 4; i += 1) {
        await new Promise((resolve) => setImmediate(resolve));
    }
}

describe("ClaudeCodeRuntimeKind", () => {
    test("starts Claude Code turns with a graceful SIGINT stop policy", async () => {
        const harness = createProcessHarness();
        const session = new ClaudeCodeRuntimeKind({
            createRuntimeProcess: harness.factory,
        }).createSession({
            provider: createProvider(),
            agent: createAgent(),
        });

        await session.openThread({
            bindingProviderId: null,
            bindingThreadId: null,
            providerId: "claude-test",
            modelId: "sonnet",
            cwd: process.cwd(),
        });
        await session.startTurn({
            threadId: "claude-pending:test",
            inputText: "interrupt me",
            cwd: process.cwd(),
            modelId: "sonnet",
            variantId: null,
        });

        expect(harness.last().stopPolicy).toEqual({
            gracefulSignal: "SIGINT",
            forceSignal: "SIGKILL",
        });

        await session.stop();
    });

    test("preserves interrupted status when SIGINT produces a result event", async () => {
        const harness = createProcessHarness();
        const session = new ClaudeCodeRuntimeKind({
            createRuntimeProcess: harness.factory,
        }).createSession({
            provider: createProvider(),
            agent: createAgent(),
        });
        const events: RuntimeKindEvent[] = [];
        session.onEvent((event) => events.push(event));

        await session.openThread({
            bindingProviderId: null,
            bindingThreadId: null,
            providerId: "claude-test",
            modelId: "sonnet",
            cwd: process.cwd(),
        });
        await session.startTurn({
            threadId: "claude-pending:test",
            inputText: "interrupt me",
            cwd: process.cwd(),
            modelId: "sonnet",
            variantId: null,
        });

        const interruptPromise = session.interruptTurn({
            threadId: "claude-pending:test",
            turnId: "turn-1",
        });
        emitJsonl(harness.last().stdout, [
            {
                type: "result",
                subtype: "error_during_execution",
                is_error: true,
                session_id: "claude-session-interrupted",
            },
        ]);
        await interruptPromise;
        await flush();

        const terminalEvents = events.filter(
            (event) => event.type === "turn_completed",
        );
        expect(terminalEvents).toHaveLength(1);
        expect(terminalEvents[0]).toMatchObject({
            type: "turn_completed",
            status: "interrupted",
        });
        expect(
            events.some(
                (event) =>
                    event.type === "provider_event" &&
                    event.event.eventType === "claude-code.turn.interrupted",
            ),
        ).toBe(true);
    });

    test("waits for stdout to drain before completing interrupted turns", async () => {
        const harness = createProcessHarness();
        const session = new ClaudeCodeRuntimeKind({
            createRuntimeProcess: harness.factory,
        }).createSession({
            provider: createProvider(),
            agent: createAgent(),
        });
        const events: RuntimeKindEvent[] = [];
        session.onEvent((event) => events.push(event));

        await session.openThread({
            bindingProviderId: null,
            bindingThreadId: null,
            providerId: "claude-test",
            modelId: "sonnet",
            cwd: process.cwd(),
        });
        await session.startTurn({
            threadId: "claude-pending:test",
            inputText: "interrupt me",
            cwd: process.cwd(),
            modelId: "sonnet",
            variantId: null,
        });

        await session.interruptTurn({
            threadId: "claude-pending:test",
            turnId: "turn-1",
        });

        expect(events.some((event) => event.type === "turn_completed")).toBe(
            false,
        );

        emitJsonl(harness.last().stdout, [
            {
                type: "system",
                subtype: "init",
                session_id: "claude-session-late-interrupt",
            },
            {
                type: "result",
                subtype: "error_during_execution",
                is_error: true,
                session_id: "claude-session-late-interrupt",
            },
        ]);
        await flush();

        const identityIndex = events.findIndex(
            (event) =>
                event.type === "provider_identity_updated" &&
                event.threadId === "claude-session-late-interrupt",
        );
        const terminalIndex = events.findIndex(
            (event) => event.type === "turn_completed",
        );

        expect(identityIndex).toBeGreaterThanOrEqual(0);
        expect(terminalIndex).toBeGreaterThan(identityIndex);
        expect(events[terminalIndex]).toMatchObject({
            type: "turn_completed",
            status: "interrupted",
        });
    });

    test("maps stream-json output into runtime events and captures session ids", async () => {
        const harness = createProcessHarness();
        const session = new ClaudeCodeRuntimeKind({
            createRuntimeProcess: harness.factory,
        }).createSession({
            provider: createProvider(),
            agent: createAgent(),
        });
        const events: RuntimeKindEvent[] = [];
        session.onEvent((event) => events.push(event));

        await session.initialize();
        await session.openThread({
            bindingProviderId: null,
            bindingThreadId: null,
            providerId: "claude-test",
            modelId: "sonnet",
            cwd: process.cwd(),
        });
        await session.startTurn({
            threadId: "claude-pending:test",
            inputText: "say hello",
            cwd: process.cwd(),
            modelId: "sonnet",
            variantId: null,
        });

        const proc = harness.last();
        emitJsonl(proc.stdout, [
            {
                type: "system",
                subtype: "init",
                session_id: "claude-session-1",
            },
            {
                type: "assistant",
                message: {
                    content: [
                        { type: "text", text: "hello " },
                        {
                            type: "tool_use",
                            id: "tool-1",
                            name: "Bash",
                            input: { command: "pwd" },
                        },
                    ],
                },
            },
            {
                type: "result",
                subtype: "success",
                is_error: false,
                result: "hello world",
                session_id: "claude-session-1",
                total_cost_usd: 0.01,
            },
        ]);
        proc.emitExit({ type: "exit", code: 0, signal: null });
        await flush();

        expect(events).toContainEqual({
            type: "provider_identity_updated",
            threadId: "claude-session-1",
            providerEvents: [
                expect.objectContaining({
                    eventType: "claude-code.session.identified",
                }),
            ],
        });
        expect(events).toContainEqual({
            type: "assistant_delta",
            delta: "hello ",
        });
        expect(events).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    type: "provider_event",
                    event: expect.objectContaining({
                        eventType: "claude-code.assistant",
                    }),
                }),
                {
                    type: "turn_completed",
                    status: "completed",
                    errorMessage: undefined,
                },
            ]),
        );

        await session.stop();
    });

    test("resumes persisted sessions and maps plan variants to Claude permission mode", async () => {
        const harness = createProcessHarness();
        const session = new ClaudeCodeRuntimeKind({
            createRuntimeProcess: harness.factory,
        }).createSession({
            provider: createProvider(),
            agent: createAgent(),
        });
        const events: RuntimeKindEvent[] = [];
        session.onEvent((event) => events.push(event));

        await session.openThread({
            bindingProviderId: "claude-test",
            bindingThreadId: "claude-session-9",
            providerId: "claude-test",
            modelId: "opus",
            cwd: process.cwd(),
        });
        await session.startTurn({
            threadId: "claude-session-9",
            inputText: "plan this",
            cwd: process.cwd(),
            modelId: "opus",
            variantId: "plan",
        });

        const proc = harness.last();
        emitJsonl(proc.stdout, [
            { type: "result", subtype: "success", is_error: false },
        ]);
        proc.emitExit({ type: "exit", code: 0, signal: null });
        await flush();

        expect(proc.args).toEqual(
            expect.arrayContaining([
                "--print",
                "--permission-mode",
                "plan",
                "--resume",
                "claude-session-9",
                "--model",
                "opus",
            ]),
        );
        expect(proc.args).not.toEqual(expect.arrayContaining(["plan this"]));
        expect(events.some((event) => event.type === "turn_completed")).toBe(
            true,
        );

        await session.stop();
    });

    test("does not resume persisted pending session placeholders", async () => {
        const harness = createProcessHarness();
        const session = new ClaudeCodeRuntimeKind({
            createRuntimeProcess: harness.factory,
        }).createSession({
            provider: createProvider(),
            agent: createAgent(),
        });
        const events: RuntimeKindEvent[] = [];
        session.onEvent((event) => events.push(event));

        const thread = await session.openThread({
            bindingProviderId: "claude-test",
            bindingThreadId: "claude-pending:old",
            providerId: "claude-test",
            modelId: "sonnet",
            cwd: process.cwd(),
        });
        await session.startTurn({
            threadId: thread.threadId,
            inputText: "start fresh",
            cwd: process.cwd(),
            modelId: "sonnet",
            variantId: null,
        });

        const proc = harness.last();
        emitJsonl(proc.stdout, [
            { type: "result", subtype: "success", is_error: false },
        ]);
        proc.emitExit({ type: "exit", code: 0, signal: null });
        await flush();

        expect(thread.isNew).toBe(true);
        expect(thread.threadId.startsWith("claude-pending:")).toBe(true);
        expect(thread.threadId).not.toBe("claude-pending:old");
        expect(proc.args).not.toEqual(expect.arrayContaining(["--resume"]));
        expect(proc.args).not.toEqual(
            expect.arrayContaining(["claude-pending:old"]),
        );
        expect(events.some((event) => event.type === "turn_completed")).toBe(
            true,
        );

        await session.stop();
    });

    test("retries stale resume failures with a fresh Claude session", async () => {
        const harness = createProcessHarness();
        const session = new ClaudeCodeRuntimeKind({
            createRuntimeProcess: harness.factory,
        }).createSession({
            provider: createProvider(),
            agent: createAgent(),
        });
        const events: RuntimeKindEvent[] = [];
        session.onEvent((event) => events.push(event));

        await session.openThread({
            bindingProviderId: "claude-test",
            bindingThreadId: "claude-session-missing",
            providerId: "claude-test",
            modelId: "sonnet",
            cwd: process.cwd(),
        });
        await session.startTurn({
            threadId: "claude-session-missing",
            inputText: "continue",
            cwd: process.cwd(),
            modelId: "sonnet",
            variantId: null,
        });

        const first = harness.last();
        expect(first.args).toEqual(
            expect.arrayContaining(["--resume", "claude-session-missing"]),
        );
        first.pushStderr("Could not resume session: session not found");
        first.stdout.end();
        first.emitExit({ type: "exit", code: 1, signal: null });

        const second = await harness.waitForLaunch(1);
        expect(second.args).not.toEqual(expect.arrayContaining(["--resume"]));
        expect(second.args).not.toEqual(
            expect.arrayContaining(["claude-session-missing"]),
        );

        emitJsonl(second.stdout, [
            {
                type: "system",
                subtype: "init",
                session_id: "claude-session-new",
            },
            {
                type: "result",
                subtype: "success",
                is_error: false,
                session_id: "claude-session-new",
            },
        ]);
        second.emitExit({ type: "exit", code: 0, signal: null });
        await flush();

        expect(events).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    type: "provider_event",
                    event: expect.objectContaining({
                        eventType: "claude-code.session.resume-failed",
                    }),
                }),
                {
                    type: "provider_identity_updated",
                    threadId: "claude-session-new",
                    providerEvents: [
                        expect.objectContaining({
                            eventType: "claude-code.session.identified",
                        }),
                    ],
                },
                {
                    type: "turn_completed",
                    status: "completed",
                    errorMessage: undefined,
                },
            ]),
        );

        await session.stop();
    });

    test("sends prompts over stdin instead of argv", async () => {
        const harness = createProcessHarness();
        const session = new ClaudeCodeRuntimeKind({
            createRuntimeProcess: harness.factory,
        }).createSession({
            provider: createProvider(),
            agent: createAgent(),
        });
        const events: RuntimeKindEvent[] = [];
        session.onEvent((event) => events.push(event));

        await session.openThread({
            bindingProviderId: null,
            bindingThreadId: null,
            providerId: "claude-test",
            modelId: "sonnet",
            cwd: process.cwd(),
        });

        const proc = harness;
        const stdinChunks: string[] = [];
        const startPromise = session.startTurn({
            threadId: "claude-pending:test",
            inputText: "prompt from stdin",
            cwd: process.cwd(),
            modelId: "sonnet",
            variantId: null,
        });
        const launched = await proc.waitForLaunch(0);
        launched.stdin.on("data", (chunk: Buffer) => {
            stdinChunks.push(chunk.toString());
        });
        await startPromise;

        emitJsonl(launched.stdout, [
            { type: "result", subtype: "success", is_error: false },
        ]);
        launched.emitExit({ type: "exit", code: 0, signal: null });
        await flush();

        expect(launched.args).not.toEqual(
            expect.arrayContaining(["prompt from stdin"]),
        );
        expect(stdinChunks.join("")).toBe("prompt from stdin");
        expect(events.some((event) => event.type === "turn_completed")).toBe(
            true,
        );

        await session.stop();
    });

    test("fails a hung turn after the configured timeout", async () => {
        const harness = createProcessHarness();
        const session = new ClaudeCodeRuntimeKind({
            createRuntimeProcess: harness.factory,
        }).createSession({
            provider: createProvider({ timeoutMs: 10 }),
            agent: createAgent(),
        });
        const events: RuntimeKindEvent[] = [];
        session.onEvent((event) => events.push(event));

        await session.openThread({
            bindingProviderId: null,
            bindingThreadId: null,
            providerId: "claude-test",
            modelId: "sonnet",
            cwd: process.cwd(),
        });
        await session.startTurn({
            threadId: "claude-pending:test",
            inputText: "hang",
            cwd: process.cwd(),
            modelId: "sonnet",
            variantId: null,
        });

        // Wait past the 10ms turn timeout. The runtime calls stop() which
        // settles the fake with a SIGTERM exit; close stdout to mirror a
        // real subprocess flushing pipes on kill.
        await Bun.sleep(20);
        const proc = harness.last();
        if (!proc.stdout.writableEnded) proc.stdout.end();
        await flush();

        expect(events).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    type: "provider_event",
                    event: expect.objectContaining({
                        eventType: "claude-code.turn.timed-out",
                    }),
                }),
                {
                    type: "turn_completed",
                    status: "errored",
                    errorMessage: "Claude Code turn timed out after 10ms.",
                },
            ]),
        );

        await session.stop();
    });

    test("waits for subprocess exit after receiving a result event", async () => {
        const harness = createProcessHarness();
        const session = new ClaudeCodeRuntimeKind({
            createRuntimeProcess: harness.factory,
        }).createSession({
            provider: createProvider(),
            agent: createAgent(),
        });
        const events: RuntimeKindEvent[] = [];
        session.onEvent((event) => events.push(event));

        await session.openThread({
            bindingProviderId: null,
            bindingThreadId: null,
            providerId: "claude-test",
            modelId: "sonnet",
            cwd: process.cwd(),
        });
        await session.startTurn({
            threadId: "claude-pending:test",
            inputText: "finish slowly",
            cwd: process.cwd(),
            modelId: "sonnet",
            variantId: null,
        });

        const proc = harness.last();
        // Result arrives first, but the turn must not complete until exit.
        proc.stdout.write(
            `${JSON.stringify({
                type: "result",
                subtype: "success",
                is_error: false,
            })}\n`,
        );
        await flush();

        expect(events.some((event) => event.type === "turn_completed")).toBe(
            false,
        );

        proc.stdout.end();
        proc.emitExit({ type: "exit", code: 0, signal: null });
        await flush();

        expect(events).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    type: "provider_event",
                    event: expect.objectContaining({
                        eventType: "claude-code.result",
                    }),
                }),
                {
                    type: "turn_completed",
                    status: "completed",
                    errorMessage: undefined,
                },
            ]),
        );

        await session.stop();
    });

    test("waits for stdout to drain after process exit before completing", async () => {
        const harness = createProcessHarness();
        const session = new ClaudeCodeRuntimeKind({
            createRuntimeProcess: harness.factory,
        }).createSession({
            provider: createProvider(),
            agent: createAgent(),
        });
        const events: RuntimeKindEvent[] = [];
        session.onEvent((event) => events.push(event));

        await session.openThread({
            bindingProviderId: null,
            bindingThreadId: null,
            providerId: "claude-test",
            modelId: "sonnet",
            cwd: process.cwd(),
        });
        await session.startTurn({
            threadId: "claude-pending:test",
            inputText: "finish while draining",
            cwd: process.cwd(),
            modelId: "sonnet",
            variantId: null,
        });

        const proc = harness.last();
        proc.emitExit({ type: "exit", code: 0, signal: null });
        await flush();

        expect(events.some((event) => event.type === "turn_completed")).toBe(
            false,
        );

        emitJsonl(proc.stdout, [
            {
                type: "system",
                subtype: "init",
                session_id: "claude-session-drained",
            },
            {
                type: "assistant",
                message: {
                    content: [{ type: "text", text: "late text" }],
                },
            },
            {
                type: "result",
                subtype: "success",
                is_error: false,
                session_id: "claude-session-drained",
            },
        ]);
        await flush();

        const identityIndex = events.findIndex(
            (event) => event.type === "provider_identity_updated",
        );
        const deltaIndex = events.findIndex(
            (event) => event.type === "assistant_delta",
        );
        const completedIndex = events.findIndex(
            (event) => event.type === "turn_completed",
        );
        expect(identityIndex).toBeGreaterThanOrEqual(0);
        expect(deltaIndex).toBeGreaterThanOrEqual(0);
        expect(completedIndex).toBeGreaterThan(identityIndex);
        expect(completedIndex).toBeGreaterThan(deltaIndex);
        expect(events).toEqual(
            expect.arrayContaining([
                {
                    type: "provider_identity_updated",
                    threadId: "claude-session-drained",
                    providerEvents: [
                        expect.objectContaining({
                            eventType: "claude-code.session.identified",
                        }),
                    ],
                },
                { type: "assistant_delta", delta: "late text" },
                {
                    type: "turn_completed",
                    status: "completed",
                    errorMessage: undefined,
                },
            ]),
        );

        await session.stop();
    });

    test("does not report handled non-zero turn exits as runtime crashes", async () => {
        const harness = createProcessHarness();
        const session = new ClaudeCodeRuntimeKind({
            createRuntimeProcess: harness.factory,
        }).createSession({
            provider: createProvider(),
            agent: createAgent(),
        });
        const events: RuntimeKindEvent[] = [];
        let exitError: Error | null = null;
        session.onEvent((event) => events.push(event));
        session.onExit((error) => {
            exitError = error;
        });

        await session.openThread({
            bindingProviderId: null,
            bindingThreadId: null,
            providerId: "claude-test",
            modelId: "sonnet",
            cwd: process.cwd(),
        });
        await session.startTurn({
            threadId: "claude-pending:test",
            inputText: "fail",
            cwd: process.cwd(),
            modelId: "sonnet",
            variantId: null,
        });

        const proc = harness.last();
        proc.pushStderr("boom");
        proc.stdout.end();
        proc.emitExit({ type: "exit", code: 7, signal: null });
        await flush();

        expect(events).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    type: "provider_event",
                    event: expect.objectContaining({
                        eventType: "claude-code.turn.failed",
                    }),
                }),
                {
                    type: "turn_completed",
                    status: "errored",
                    errorMessage: "boom",
                },
            ]),
        );
        expect(exitError).toBeNull();

        await session.stop();
    });

    test("returns configured models before static fallback models", async () => {
        const provider = createProvider();
        provider.models = [
            {
                id: "claude-custom",
                label: "Claude Custom",
                enabled: true,
                supportsReasoning: false,
                variants: [
                    {
                        id: "default",
                        label: "Default",
                        enabled: true,
                    },
                ],
            },
        ];

        await expect(
            new ClaudeCodeRuntimeKind().listModels({
                provider,
                agent: createAgent(),
            }),
        ).resolves.toEqual([
            expect.objectContaining({
                id: "claude-custom",
                providerMetadata: { source: "configured" },
            }),
        ]);
        await expect(
            new ClaudeCodeRuntimeKind().listModels({
                provider: {
                    ...provider,
                    models: [],
                } satisfies ProviderConfig,
                agent: createAgent(),
            }),
        ).resolves.toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    id: "sonnet",
                    providerMetadata: { source: "static" },
                }),
            ]),
        );
    });
});
