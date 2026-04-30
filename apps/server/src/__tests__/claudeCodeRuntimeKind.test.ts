import { describe, expect, test } from "bun:test";
import { PassThrough } from "node:stream";

import { ClaudeCodeRuntimeKind } from "../claudeCodeRuntimeKind.ts";
import type {
    AgentConfig,
    ClaudeCodeProviderConfig,
    ProviderConfig,
} from "../config.ts";
import type {
    ManagedRuntimeProcess,
    RuntimeProcessExit,
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
    script: string,
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
            command: process.execPath,
            args: ["-e", script, "--"],
            baseEnv: {},
            cwd: process.cwd(),
            permissionMode: "auto",
            ...overrides,
        },
    };
}

async function waitFor(condition: () => boolean): Promise<void> {
    for (let attempt = 0; attempt < 100; attempt += 1) {
        if (condition()) {
            return;
        }
        await new Promise((resolve) => setTimeout(resolve, 0));
    }

    throw new Error("Timed out waiting for test condition.");
}

function scriptThatEmits(lines: unknown[]): string {
    return `
for (const line of ${JSON.stringify(lines)}) {
  process.stdout.write(JSON.stringify(line) + "\\n");
}
`;
}

function createControlledProcess() {
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    let hasExited = false;
    const exitHandlers = new Set<(exit: RuntimeProcessExit) => void>();
    const runtimeProcess = {
        stdin,
        stdout,
        stderr,
        get hasExited() {
            return hasExited;
        },
        get isStopping() {
            return false;
        },
        onExit(handler: (exit: RuntimeProcessExit) => void) {
            exitHandlers.add(handler);
        },
        async stop() {
            hasExited = true;
            for (const handler of exitHandlers) {
                handler({ type: "exit", code: null, signal: "SIGTERM" });
            }
        },
        emitExit(exit: RuntimeProcessExit) {
            hasExited = true;
            for (const handler of exitHandlers) {
                handler(exit);
            }
        },
    };
    return {
        stdin,
        stdout,
        stderr,
        runtimeProcess: runtimeProcess as unknown as ManagedRuntimeProcess,
        emitExit: runtimeProcess.emitExit,
    };
}

describe("ClaudeCodeRuntimeKind", () => {
    test("maps stream-json output into runtime events and captures session ids", async () => {
        const session = new ClaudeCodeRuntimeKind().createSession({
            provider: createProvider(
                scriptThatEmits([
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
                ]),
            ),
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
        await waitFor(() =>
            events.some((event) => event.type === "turn_completed"),
        );

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
        const session = new ClaudeCodeRuntimeKind().createSession({
            provider: createProvider(`
process.stdout.write(JSON.stringify({ type: "argv", argv: process.argv }) + "\\n");
process.stdout.write(JSON.stringify({ type: "result", subtype: "success", is_error: false }) + "\\n");
`),
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
        await waitFor(() =>
            events.some((event) => event.type === "turn_completed"),
        );

        const argvEvent = events.find(
            (event) =>
                event.type === "provider_event" &&
                event.event.eventType === "claude-code.argv",
        );
        expect(argvEvent).toBeDefined();
        expect(
            argvEvent?.type === "provider_event"
                ? argvEvent.event.metadata.argv
                : null,
        ).toEqual(
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
        expect(
            argvEvent?.type === "provider_event"
                ? argvEvent.event.metadata.argv
                : null,
        ).not.toEqual(expect.arrayContaining(["plan this"]));

        await session.stop();
    });

    test("does not resume persisted pending session placeholders", async () => {
        const session = new ClaudeCodeRuntimeKind().createSession({
            provider: createProvider(`
process.stdout.write(JSON.stringify({ type: "argv", argv: process.argv }) + "\\n");
process.stdout.write(JSON.stringify({ type: "result", subtype: "success", is_error: false }) + "\\n");
`),
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
        await waitFor(() =>
            events.some((event) => event.type === "turn_completed"),
        );

        expect(thread.isNew).toBe(true);
        expect(thread.threadId.startsWith("claude-pending:")).toBe(true);
        expect(thread.threadId).not.toBe("claude-pending:old");
        const argvEvent = events.find(
            (event) =>
                event.type === "provider_event" &&
                event.event.eventType === "claude-code.argv",
        );
        expect(argvEvent).toBeDefined();
        expect(
            argvEvent?.type === "provider_event"
                ? argvEvent.event.metadata.argv
                : null,
        ).not.toEqual(expect.arrayContaining(["--resume"]));
        expect(
            argvEvent?.type === "provider_event"
                ? argvEvent.event.metadata.argv
                : null,
        ).not.toEqual(expect.arrayContaining(["claude-pending:old"]));

        await session.stop();
    });

    test("retries stale resume failures with a fresh Claude session", async () => {
        const session = new ClaudeCodeRuntimeKind().createSession({
            provider: createProvider(`
if (process.argv.includes("--resume")) {
  process.stderr.write("Could not resume session: session not found");
  process.exit(1);
}
process.stdout.write(JSON.stringify({ type: "argv", argv: process.argv }) + "\\n");
process.stdout.write(JSON.stringify({ type: "system", subtype: "init", session_id: "claude-session-new" }) + "\\n");
process.stdout.write(JSON.stringify({ type: "result", subtype: "success", is_error: false, session_id: "claude-session-new" }) + "\\n");
`),
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
        await waitFor(() =>
            events.some((event) => event.type === "turn_completed"),
        );

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
        const argvEvent = events.find(
            (event) =>
                event.type === "provider_event" &&
                event.event.eventType === "claude-code.argv",
        );
        expect(
            argvEvent?.type === "provider_event"
                ? argvEvent.event.metadata.argv
                : null,
        ).not.toEqual(expect.arrayContaining(["--resume"]));
        expect(
            argvEvent?.type === "provider_event"
                ? argvEvent.event.metadata.argv
                : null,
        ).not.toEqual(expect.arrayContaining(["claude-session-missing"]));

        await session.stop();
    });

    test("sends prompts over stdin instead of argv", async () => {
        const session = new ClaudeCodeRuntimeKind().createSession({
            provider: createProvider(`
let stdin = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => stdin += chunk);
process.stdin.on("end", () => {
  process.stdout.write(JSON.stringify({ type: "argv", argv: process.argv }) + "\\n");
  process.stdout.write(JSON.stringify({ type: "stdin", stdin }) + "\\n");
  process.stdout.write(JSON.stringify({ type: "result", subtype: "success", is_error: false }) + "\\n");
});
`),
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
            inputText: "prompt from stdin",
            cwd: process.cwd(),
            modelId: "sonnet",
            variantId: null,
        });
        await waitFor(() =>
            events.some((event) => event.type === "turn_completed"),
        );

        const argvEvent = events.find(
            (event) =>
                event.type === "provider_event" &&
                event.event.eventType === "claude-code.argv",
        );
        const stdinEvent = events.find(
            (event) =>
                event.type === "provider_event" &&
                event.event.eventType === "claude-code.stdin",
        );
        expect(
            argvEvent?.type === "provider_event"
                ? argvEvent.event.metadata.argv
                : null,
        ).not.toEqual(expect.arrayContaining(["prompt from stdin"]));
        expect(
            stdinEvent?.type === "provider_event"
                ? stdinEvent.event.metadata.stdin
                : null,
        ).toBe("prompt from stdin");

        await session.stop();
    });

    test("fails a hung turn after the configured timeout", async () => {
        const session = new ClaudeCodeRuntimeKind().createSession({
            provider: createProvider("setInterval(() => {}, 1000);", {
                timeoutMs: 10,
            }),
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
        await waitFor(() =>
            events.some((event) => event.type === "turn_completed"),
        );

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
        const session = new ClaudeCodeRuntimeKind().createSession({
            provider: createProvider(`
process.stdout.write(JSON.stringify({ type: "result", subtype: "success", is_error: false }) + "\\n");
setTimeout(() => process.exit(0), 50);
`),
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
        await Bun.sleep(10);

        expect(events.some((event) => event.type === "turn_completed")).toBe(
            false,
        );

        await waitFor(() =>
            events.some((event) => event.type === "turn_completed"),
        );
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
        const controlledProcess = createControlledProcess();
        const session = new ClaudeCodeRuntimeKind({
            createRuntimeProcess: () => controlledProcess.runtimeProcess,
        }).createSession({
            provider: createProvider(""),
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

        controlledProcess.emitExit({
            type: "exit",
            code: 0,
            signal: null,
        });
        await Bun.sleep(0);

        expect(events.some((event) => event.type === "turn_completed")).toBe(
            false,
        );

        controlledProcess.stdout.end(
            [
                JSON.stringify({
                    type: "system",
                    subtype: "init",
                    session_id: "claude-session-drained",
                }),
                JSON.stringify({
                    type: "assistant",
                    message: {
                        content: [{ type: "text", text: "late text" }],
                    },
                }),
                JSON.stringify({
                    type: "result",
                    subtype: "success",
                    is_error: false,
                    session_id: "claude-session-drained",
                }),
                "",
            ].join("\n"),
        );
        await waitFor(() =>
            events.some((event) => event.type === "turn_completed"),
        );

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
        const session = new ClaudeCodeRuntimeKind().createSession({
            provider: createProvider(
                'process.stderr.write("boom"); process.exit(7);',
            ),
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
        await waitFor(() =>
            events.some((event) => event.type === "turn_completed"),
        );

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
        const provider = createProvider(scriptThatEmits([]));
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
