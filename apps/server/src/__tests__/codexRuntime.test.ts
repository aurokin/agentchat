import { describe, expect, test } from "bun:test";

import type { AgentchatConfig } from "../config.ts";
import type { RuntimePersistenceClient } from "../runtimePersistence.ts";
import {
    buildInitialTurnText,
    CodexRuntimeManager,
    isRecoverableThreadResumeError,
} from "../codexRuntime.ts";

function createConfig(): AgentchatConfig {
    return {
        version: 1,
        auth: {
            allowlistMode: "email",
            allowedEmails: [],
            allowedDomains: [],
            googleHostedDomain: null,
        },
        providers: [
            {
                id: "codex-default",
                kind: "codex",
                label: "Codex",
                enabled: true,
                idleTtlSeconds: 60,
                modelCacheTtlSeconds: 60,
                models: [
                    {
                        id: "gpt-5.3-codex",
                        label: "GPT-5.3 Codex",
                        enabled: true,
                        supportsReasoning: true,
                        variants: [],
                    },
                ],
                codex: {
                    command: "codex",
                    args: ["app-server"],
                    baseEnv: {},
                    cwd: "/tmp",
                },
            },
        ],
        agents: [
            {
                id: "agent-1",
                name: "Agent 1",
                enabled: true,
                rootPath: "/tmp/agent-1",
                providerIds: ["codex-default"],
                defaultProviderId: "codex-default",
                modelAllowlist: [],
                variantAllowlist: [],
                tags: [],
                sortOrder: 0,
            },
        ],
    };
}

type FakeClientOptions = {
    resumeError?: Error;
    resumedThreadId?: string;
    startedThreadId?: string;
    turnId?: string;
    autoComplete?: boolean;
};

class FakeCodexClient {
    readonly requests: Array<{ method: string; params: unknown }> = [];
    readonly options: FakeClientOptions;
    stopped = false;
    private notificationHandler: ((notification: any) => void) | null = null;

    constructor(options: FakeClientOptions = {}) {
        this.options = options;
    }

    async initialize(): Promise<void> {
        return undefined;
    }

    async request(method: string, params: unknown): Promise<unknown> {
        this.requests.push({ method, params });

        if (method === "thread/resume") {
            if (this.options.resumeError) {
                throw this.options.resumeError;
            }
            return {
                thread: {
                    id: this.options.resumedThreadId ?? "thread-resumed",
                },
            };
        }

        if (method === "thread/start") {
            return {
                thread: {
                    id: this.options.startedThreadId ?? "thread-started",
                },
            };
        }

        if (method === "turn/start") {
            if (this.options.autoComplete !== false) {
                setTimeout(() => {
                    this.notificationHandler?.({
                        method: "turn/completed",
                        params: {
                            turn: {
                                status: "completed",
                            },
                        },
                    });
                }, 0);
            }
            return {
                turn: {
                    id: this.options.turnId ?? "turn-1",
                },
            };
        }

        if (method === "turn/interrupt") {
            return {};
        }

        throw new Error(`Unexpected request: ${method}`);
    }

    onNotification(handler: (notification: any) => void): void {
        this.notificationHandler = handler;
    }

    onExit(handler: (error: Error) => void): void {
        void handler;
    }

    stop(): void {
        this.stopped = true;
    }

    emit(notification: unknown): void {
        this.notificationHandler?.(notification);
    }
}

function createPersistence(
    binding: {
        provider: string;
        providerThreadId: string | null;
    } | null,
) {
    return {
        readRuntimeBindingCalls: [] as Array<{
            userId: string;
            conversationLocalId: string;
        }>,
        runtimeBindingCalls: [] as Array<Record<string, unknown>>,
        runStartedCalls: [] as Array<Record<string, unknown>>,
        runCompletedCalls: [] as Array<Record<string, unknown>>,
        async readRuntimeBinding(payload: {
            userId: string;
            conversationLocalId: string;
        }) {
            this.readRuntimeBindingCalls.push(payload);
            if (!binding) {
                return null;
            }

            return {
                provider: binding.provider,
                status: "expired" as const,
                providerThreadId: binding.providerThreadId,
                providerResumeToken: null,
                activeRunId: null,
                lastError: null,
                lastEventAt: null,
                expiresAt: null,
                updatedAt: Date.now(),
            };
        },
        async runtimeBinding(payload: Record<string, unknown>) {
            this.runtimeBindingCalls.push(payload);
        },
        async runStarted(payload: Record<string, unknown>) {
            this.runStartedCalls.push(payload);
        },
        async messageDelta() {
            return undefined;
        },
        async runCompleted(payload: Record<string, unknown>) {
            this.runCompletedCalls.push(payload);
        },
        async runInterrupted() {
            return undefined;
        },
        async runFailed() {
            return undefined;
        },
    };
}

function createCommand() {
    return {
        id: "cmd-1",
        type: "conversation.send" as const,
        payload: {
            conversationId: "chat-1",
            agentId: "agent-1",
            modelId: "gpt-5.3-codex",
            variantId: null,
            thinking: "medium" as const,
            content: "Continue the migration",
            userMessageId: "user-1",
            assistantMessageId: "assistant-1",
            history: [
                {
                    role: "user" as const,
                    content: "Summarize the current migration status",
                },
                {
                    role: "assistant" as const,
                    content: "Runtime persistence is already wired up",
                },
            ],
        },
    };
}

describe("codex runtime helpers", () => {
    test("uses the raw message when there is no prior history", () => {
        expect(buildInitialTurnText([], "Fix the failing test")).toBe(
            "Fix the failing test",
        );
    });

    test("formats existing conversation history for a fresh runtime", () => {
        expect(
            buildInitialTurnText(
                [
                    { role: "user", content: "Summarize this repo" },
                    { role: "assistant", content: "What should I focus on?" },
                ],
                "Focus on the new backend plan",
            ),
        ).toContain("Conversation so far:");
        expect(
            buildInitialTurnText(
                [
                    { role: "user", content: "Summarize this repo" },
                    { role: "assistant", content: "What should I focus on?" },
                ],
                "Focus on the new backend plan",
            ),
        ).toContain("Latest user message: Focus on the new backend plan");
    });

    test("treats missing threads as recoverable resume failures", () => {
        expect(
            isRecoverableThreadResumeError(
                new Error("thread/resume failed: thread not found"),
            ),
        ).toBe(true);
    });

    test("does not treat generic resume failures as recoverable", () => {
        expect(
            isRecoverableThreadResumeError(
                new Error("thread/resume failed: timed out waiting for server"),
            ),
        ).toBe(false);
    });
});

describe("CodexRuntimeManager", () => {
    test("resumes persisted Codex threads before starting a turn", async () => {
        const config = createConfig();
        const persistence = createPersistence({
            provider: "codex-default",
            providerThreadId: "thread-existing",
        });
        const fakeClient = new FakeCodexClient({
            resumedThreadId: "thread-existing",
        });
        const manager = new CodexRuntimeManager({
            getConfig: () => config,
            persistence: persistence as unknown as RuntimePersistenceClient,
            createClient: () => fakeClient,
        });

        const events: Array<{
            type: string;
            payload: Record<string, unknown>;
        }> = [];
        await manager.sendMessage({
            userSub: "sub-1",
            userId: "user-1",
            subscriberId: "socket-1",
            command: createCommand(),
            sendEvent: (event) => {
                events.push(event);
            },
        });

        expect(fakeClient.requests.map((request) => request.method)).toEqual([
            "thread/resume",
            "turn/start",
        ]);
        expect(
            (
                fakeClient.requests[1]?.params as {
                    input: Array<{ text: string }>;
                }
            ).input[0]?.text,
        ).toBe("Continue the migration");
        expect(persistence.readRuntimeBindingCalls).toEqual([
            {
                userId: "user-1",
                conversationLocalId: "chat-1",
            },
        ]);
        expect(events.map((event) => event.type)).toEqual([
            "run.started",
            "message.completed",
            "run.completed",
        ]);
    });

    test("maps the selected variant onto Codex effort", async () => {
        const config = createConfig();
        const persistence = createPersistence(null);
        const fakeClient = new FakeCodexClient();
        const manager = new CodexRuntimeManager({
            getConfig: () => config,
            persistence: persistence as unknown as RuntimePersistenceClient,
            createClient: () => fakeClient,
        });

        await manager.sendMessage({
            userSub: "sub-1",
            userId: "user-1",
            subscriberId: "socket-1",
            command: {
                ...createCommand(),
                payload: {
                    ...createCommand().payload,
                    variantId: "deep",
                    thinking: "low",
                },
            },
            sendEvent: () => {},
        });

        expect(
            (
                fakeClient.requests.find(
                    (request) => request.method === "turn/start",
                )?.params as {
                    effort?: string;
                }
            ).effort,
        ).toBe("high");
    });

    test("falls back to thread/start when resume hits a recoverable error", async () => {
        const config = createConfig();
        const persistence = createPersistence({
            provider: "codex-default",
            providerThreadId: "thread-stale",
        });
        const fakeClient = new FakeCodexClient({
            resumeError: new Error("thread/resume failed: thread not found"),
            startedThreadId: "thread-fresh",
        });
        const manager = new CodexRuntimeManager({
            getConfig: () => config,
            persistence: persistence as unknown as RuntimePersistenceClient,
            createClient: () => fakeClient,
        });

        await manager.sendMessage({
            userSub: "sub-1",
            userId: "user-1",
            subscriberId: "socket-1",
            command: createCommand(),
            sendEvent: () => undefined,
        });

        expect(fakeClient.requests.map((request) => request.method)).toEqual([
            "thread/resume",
            "thread/start",
            "turn/start",
        ]);
        expect(
            (
                fakeClient.requests[2]?.params as {
                    input: Array<{ text: string }>;
                }
            ).input[0]?.text,
        ).toBe(
            buildInitialTurnText(
                createCommand().payload.history,
                "Continue the migration",
            ),
        );
    });

    test("surfaces non-recoverable resume failures without starting a new thread", async () => {
        const config = createConfig();
        const persistence = createPersistence({
            provider: "codex-default",
            providerThreadId: "thread-stale",
        });
        const fakeClient = new FakeCodexClient({
            resumeError: new Error(
                "thread/resume failed: timed out waiting for server",
            ),
        });
        const manager = new CodexRuntimeManager({
            getConfig: () => config,
            persistence: persistence as unknown as RuntimePersistenceClient,
            createClient: () => fakeClient,
        });

        await expect(
            manager.sendMessage({
                userSub: "sub-1",
                userId: "user-1",
                subscriberId: "socket-1",
                command: createCommand(),
                sendEvent: () => undefined,
            }),
        ).rejects.toThrow("thread/resume failed: timed out waiting for server");
        expect(fakeClient.requests.map((request) => request.method)).toEqual([
            "thread/resume",
        ]);
        expect(fakeClient.stopped).toBe(true);
    });

    test("replays the active run snapshot to newly subscribed clients", async () => {
        const config = createConfig();
        const persistence = createPersistence(null);
        const fakeClient = new FakeCodexClient({
            startedThreadId: "thread-fresh",
            autoComplete: false,
        });
        const manager = new CodexRuntimeManager({
            getConfig: () => config,
            persistence: persistence as unknown as RuntimePersistenceClient,
            createClient: () => fakeClient,
        });

        const sendPromise = manager.sendMessage({
            userSub: "sub-1",
            userId: "user-1",
            subscriberId: "socket-1",
            command: createCommand(),
            sendEvent: () => undefined,
        });

        await Bun.sleep(0);
        fakeClient.emit({
            method: "item/agentMessage/delta",
            params: {
                delta: "Working on it",
            },
        });

        const replayedEvents: Array<{
            type: string;
            payload: Record<string, unknown>;
        }> = [];

        manager.subscribe({
            userSub: "sub-1",
            conversationId: "chat-1",
            subscriberId: "socket-2",
            sendEvent: (event) => {
                replayedEvents.push(event);
            },
        });

        expect(replayedEvents).toEqual([
            {
                type: "run.started",
                payload: {
                    conversationId: "chat-1",
                    runId: expect.any(String),
                    messageId: "assistant-1",
                },
            },
            {
                type: "message.delta",
                payload: {
                    conversationId: "chat-1",
                    messageId: "assistant-1",
                    delta: "Working on it",
                    content: "Working on it",
                },
            },
        ]);

        fakeClient.emit({
            method: "turn/completed",
            params: {
                turn: {
                    status: "completed",
                },
            },
        });
        await sendPromise;
    });

    test("interrupt is a no-op when no active run exists", async () => {
        const manager = new CodexRuntimeManager({
            getConfig: () => createConfig(),
            persistence: createPersistence(
                null,
            ) as unknown as RuntimePersistenceClient,
            createClient: () => new FakeCodexClient(),
        });

        await expect(
            manager.interrupt({
                userSub: "sub-1",
                conversationId: "chat-1",
            }),
        ).resolves.toBeUndefined();
    });

    test("recycles the runtime when the agent rootPath changes in config", async () => {
        const config = createConfig();
        const persistence = createPersistence(null);
        const clients: FakeCodexClient[] = [];
        const manager = new CodexRuntimeManager({
            getConfig: () => config,
            persistence: persistence as unknown as RuntimePersistenceClient,
            createClient: () => {
                const client = new FakeCodexClient();
                clients.push(client);
                return client;
            },
        });

        await manager.sendMessage({
            userSub: "sub-1",
            userId: "user-1",
            subscriberId: "socket-1",
            command: createCommand(),
            sendEvent: () => undefined,
        });

        const currentAgent = config.agents[0];
        if (!currentAgent) {
            throw new Error("Expected agent config");
        }

        config.agents[0] = {
            ...currentAgent,
            rootPath: "/tmp/agent-1-next",
        };

        await manager.sendMessage({
            userSub: "sub-1",
            userId: "user-1",
            subscriberId: "socket-1",
            command: createCommand(),
            sendEvent: () => undefined,
        });

        expect(clients).toHaveLength(2);
        expect(clients[0]?.stopped).toBe(true);
        expect(clients[1]?.stopped).toBe(false);
    });
});
