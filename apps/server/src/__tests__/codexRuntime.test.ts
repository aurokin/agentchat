import {
    existsSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, test } from "bun:test";

import type { AgentchatConfig } from "../config.ts";
import type { RuntimePersistenceClient } from "../runtimePersistence.ts";
import { WorkspaceManager } from "../workspaceManager.ts";
import {
    buildInitialTurnText,
    CodexRuntimeManager,
    isRecoverableThreadResumeError,
} from "../codexRuntime.ts";

const tempRoots: string[] = [];

function makeTempDir(name: string): string {
    const dir = mkdtempSync(path.join(tmpdir(), `${name}-`));
    tempRoots.push(dir);
    return dir;
}

afterEach(() => {
    for (const tempRoot of tempRoots.splice(0)) {
        rmSync(tempRoot, { force: true, recursive: true });
    }
});

function createConfig(): AgentchatConfig {
    return {
        version: 1,
        sandboxRoot: "/tmp/agentchat-sandboxes",
        auth: {
            defaultProviderId: "google-main",
            providers: [
                {
                    id: "google-main",
                    kind: "google",
                    enabled: true,
                    allowlistMode: "email",
                    allowedEmails: [],
                    allowedDomains: [],
                    googleHostedDomain: null,
                },
            ],
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
                defaultVisible: true,
                visibilityOverrides: [],
                rootPath: "/tmp/agent-1",
                providerIds: ["codex-default"],
                defaultProviderId: "codex-default",
                modelAllowlist: [],
                variantAllowlist: [],
                tags: [],
                sortOrder: 0,
                workspaceMode: "shared",
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
    turnStartError?: Error;
};

class FakeCodexClient {
    readonly requests: Array<{ method: string; params: unknown }> = [];
    readonly options: FakeClientOptions;
    stopped = false;
    private notificationHandler: ((notification: any) => void) | null = null;
    private exitHandler: ((error: Error) => void) | null = null;

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
            if (this.options.turnStartError) {
                throw this.options.turnStartError;
            }
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
        this.exitHandler = handler;
    }

    stop(): void {
        this.stopped = true;
    }

    emit(notification: unknown): void {
        this.notificationHandler?.(notification);
    }

    emitExit(error: Error): void {
        this.exitHandler?.(error);
    }
}

function createPersistence(
    binding: {
        provider: string;
        providerThreadId: string | null;
        status?: "idle" | "active" | "expired" | "errored";
        activeRunId?: string | null;
        workspaceMode?: "shared" | "copy-on-conversation";
        workspaceRootPath?: string;
        workspaceCwd?: string;
        updatedAt?: number;
    } | null,
) {
    return {
        readRuntimeBindingCalls: [] as Array<{
            userId: string;
            agentId: string;
            conversationLocalId: string;
        }>,
        chatExistsCalls: [] as Array<{
            userId: string;
            agentId: string;
            localId: string;
        }>,
        runtimeBindingCalls: [] as Array<Record<string, unknown>>,
        runStartedCalls: [] as Array<Record<string, unknown>>,
        messageStartedCalls: [] as Array<Record<string, unknown>>,
        runCompletedCalls: [] as Array<Record<string, unknown>>,
        runFailedCalls: [] as Array<Record<string, unknown>>,
        runInterruptedCalls: [] as Array<Record<string, unknown>>,
        recoverStaleRunCalls: [] as Array<Record<string, unknown>>,
        async readRuntimeBinding(payload: {
            userId: string;
            agentId: string;
            conversationLocalId: string;
        }) {
            this.readRuntimeBindingCalls.push(payload);
            if (!binding) {
                return null;
            }

            return {
                provider: binding.provider,
                status: binding.status ?? ("expired" as const),
                providerThreadId: binding.providerThreadId,
                providerResumeToken: null,
                activeRunId: binding.activeRunId ?? null,
                lastError: null,
                lastEventAt: null,
                expiresAt: null,
                workspaceMode: binding.workspaceMode,
                workspaceRootPath: binding.workspaceRootPath,
                workspaceCwd: binding.workspaceCwd,
                updatedAt: binding.updatedAt ?? Date.now(),
            };
        },
        async chatExists(userId: string, agentId: string, localId: string) {
            this.chatExistsCalls.push({ userId, localId, agentId });
            return false;
        },
        async runtimeBinding(payload: Record<string, unknown>) {
            this.runtimeBindingCalls.push(payload);
        },
        async runStarted(payload: Record<string, unknown>) {
            this.runStartedCalls.push(payload);
        },
        async messageStarted(payload: Record<string, unknown>) {
            this.messageStartedCalls.push(payload);
        },
        async messageDelta() {
            return undefined;
        },
        async runCompleted(payload: Record<string, unknown>) {
            this.runCompletedCalls.push(payload);
        },
        async runInterrupted(payload: Record<string, unknown>) {
            this.runInterruptedCalls.push(payload);
        },
        async runFailed(payload: Record<string, unknown>) {
            this.runFailedCalls.push(payload);
        },
        async recoverStaleRun(payload: Record<string, unknown>) {
            this.recoverStaleRunCalls.push(payload);
        },
    };
}

function createWorkspaceManager(
    getConfig: () => AgentchatConfig,
): WorkspaceManager {
    return new WorkspaceManager({
        getConfig,
        rootsRegistryPath: path.join(
            makeTempDir("sandbox-roots-registry"),
            "sandbox-roots.json",
        ),
    });
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
        expect(
            isRecoverableThreadResumeError(
                new Error(
                    "thread/resume failed: no rollout found for thread id 00000000-0000-4000-8000-000000000bad",
                ),
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
            workspaceMode: "shared",
            workspaceRootPath: config.agents[0]!.rootPath,
            workspaceCwd: config.agents[0]!.rootPath,
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
                agentId: "agent-1",
                conversationLocalId: "chat-1",
            },
        ]);
        expect(events.map((event) => event.type)).toEqual([
            "run.started",
            "message.started",
            "message.completed",
            "run.completed",
        ]);
    });

    test("resumes legacy shared bindings without persisted workspace metadata", async () => {
        const config = createConfig();
        const configPath = path.join(makeTempDir("config"), "agentchat.json");
        writeFileSync(configPath, JSON.stringify({ version: 1 }));
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
            configPath,
        });

        await manager.sendMessage({
            userId: "user-1",
            subscriberId: "socket-1",
            command: createCommand(),
            sendEvent: () => undefined,
        });

        expect(fakeClient.requests.map((request) => request.method)).toEqual([
            "thread/resume",
            "turn/start",
        ]);
    });

    test("does not resume legacy shared bindings after the config changes", async () => {
        const config = createConfig();
        const configPath = path.join(makeTempDir("config"), "agentchat.json");
        writeFileSync(configPath, JSON.stringify({ version: 1 }));
        const persistence = createPersistence({
            provider: "codex-default",
            providerThreadId: "thread-existing",
            updatedAt: Date.now() - 60_000,
        });
        const fakeClient = new FakeCodexClient({
            startedThreadId: "thread-new",
        });
        const manager = new CodexRuntimeManager({
            getConfig: () => config,
            persistence: persistence as unknown as RuntimePersistenceClient,
            createClient: () => fakeClient,
            configPath,
        });

        await manager.sendMessage({
            userId: "user-1",
            subscriberId: "socket-1",
            command: createCommand(),
            sendEvent: () => undefined,
        });

        expect(fakeClient.requests.map((request) => request.method)).toEqual([
            "thread/start",
            "turn/start",
        ]);
    });

    test("uses the selected Codex effort variant directly", async () => {
        const config = createConfig();
        const persistence = createPersistence(null);
        const fakeClient = new FakeCodexClient();
        const manager = new CodexRuntimeManager({
            getConfig: () => config,
            persistence: persistence as unknown as RuntimePersistenceClient,
            createClient: () => fakeClient,
        });

        await manager.sendMessage({
            userId: "user-1",
            subscriberId: "socket-1",
            command: {
                ...createCommand(),
                payload: {
                    ...createCommand().payload,
                    variantId: "high",
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
            workspaceMode: "shared",
            workspaceRootPath: config.agents[0]!.rootPath,
            workspaceCwd: config.agents[0]!.rootPath,
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
            workspaceMode: "shared",
            workspaceRootPath: config.agents[0]!.rootPath,
            workspaceCwd: config.agents[0]!.rootPath,
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

        await manager.subscribe({
            userId: "user-1",
            conversationId: "chat-1",
            agentId: "agent-1",
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
                type: "message.started",
                payload: {
                    conversationId: "chat-1",
                    runId: expect.any(String),
                    messageId: "assistant-1",
                    messageIndex: 0,
                    kind: "assistant_message",
                    content: "Working on it",
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

    test("keeps the sending subscriber attached after explicit unsubscribe until the run settles", async () => {
        const config = createConfig();
        const persistence = createPersistence(null);
        const fakeClient = new FakeCodexClient({
            startedThreadId: "thread-fresh",
            autoComplete: false,
        });
        const events: Array<{
            type: string;
            payload: Record<string, unknown>;
        }> = [];
        const manager = new CodexRuntimeManager({
            getConfig: () => config,
            persistence: persistence as unknown as RuntimePersistenceClient,
            createClient: () => fakeClient,
        });

        const sendPromise = manager.sendMessage({
            userId: "user-1",
            subscriberId: "socket-1",
            command: createCommand(),
            sendEvent: (event) => {
                events.push(event);
            },
        });

        await Bun.sleep(0);
        manager.unsubscribe({
            subscriberId: "socket-1",
            conversationId: "chat-1",
            agentId: "agent-1",
        });

        fakeClient.emit({
            method: "item/agentMessage/delta",
            params: {
                delta: "Still streaming",
            },
        });
        fakeClient.emit({
            method: "turn/completed",
            params: {
                turn: {
                    status: "completed",
                },
            },
        });

        await sendPromise;

        expect(events.map((event) => event.type)).toEqual([
            "run.started",
            "message.started",
            "message.delta",
            "message.completed",
            "run.completed",
        ]);
    });

    test("reconciles orphaned active runs when a client subscribes after runtime loss", async () => {
        const config = createConfig();
        const persistence = createPersistence({
            provider: "codex-default",
            providerThreadId: "thread-orphaned",
            status: "active",
            activeRunId: "run-orphaned",
        });
        const manager = new CodexRuntimeManager({
            getConfig: () => config,
            persistence: persistence as unknown as RuntimePersistenceClient,
            createClient: () => new FakeCodexClient(),
        });

        await manager.subscribe({
            userId: "user-1",
            conversationId: "chat-1",
            agentId: "agent-1",
            subscriberId: "socket-2",
            sendEvent: () => undefined,
        });

        expect(persistence.readRuntimeBindingCalls).toEqual([
            {
                userId: "user-1",
                agentId: "agent-1",
                conversationLocalId: "chat-1",
            },
        ]);
        expect(persistence.recoverStaleRunCalls).toHaveLength(1);
        expect(persistence.recoverStaleRunCalls[0]).toMatchObject({
            userId: "user-1",
            agentId: "agent-1",
            conversationLocalId: "chat-1",
            externalRunId: "run-orphaned",
            errorMessage:
                "This run was orphaned after the runtime disconnected before completion.",
        });
    });

    test("keeps an active runtime across reconnects for the same user", async () => {
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

        const primaryEvents: Array<{
            type: string;
            payload: Record<string, unknown>;
        }> = [];
        const reconnectedEvents: Array<{
            type: string;
            payload: Record<string, unknown>;
        }> = [];

        const sendPromise = manager.sendMessage({
            userId: "user-1",
            subscriberId: "socket-1",
            command: createCommand(),
            sendEvent: (event) => {
                primaryEvents.push(event);
            },
        });

        await Bun.sleep(0);

        await manager.subscribe({
            userId: "user-1",
            conversationId: "chat-1",
            agentId: "agent-1",
            subscriberId: "socket-2",
            sendEvent: (event) => {
                reconnectedEvents.push(event);
            },
        });

        fakeClient.emit({
            method: "turn/completed",
            params: {
                turn: {
                    status: "completed",
                },
            },
        });

        await sendPromise;

        expect(persistence.recoverStaleRunCalls).toHaveLength(0);
        expect(reconnectedEvents.map((event) => event.type)).toEqual([
            "run.started",
            "message.started",
            "message.completed",
            "run.completed",
        ]);
    });

    test("attaches subscribers that subscribed before the runtime existed", async () => {
        const config = createConfig();
        const persistence = createPersistence(null);
        const fakeClient = new FakeCodexClient({
            startedThreadId: "thread-fresh",
            autoComplete: false,
        });
        const observerEvents: Array<{
            type: string;
            payload: Record<string, unknown>;
        }> = [];
        const senderEvents: Array<{
            type: string;
            payload: Record<string, unknown>;
        }> = [];
        const manager = new CodexRuntimeManager({
            getConfig: () => config,
            persistence: persistence as unknown as RuntimePersistenceClient,
            createClient: () => fakeClient,
        });

        await manager.subscribe({
            userId: "user-1",
            conversationId: "chat-1",
            agentId: "agent-1",
            subscriberId: "socket-2",
            sendEvent: (event) => {
                observerEvents.push(event);
            },
        });

        const sendPromise = manager.sendMessage({
            userId: "user-1",
            subscriberId: "socket-1",
            command: createCommand(),
            sendEvent: (event) => {
                senderEvents.push(event);
            },
        });

        await Bun.sleep(0);
        fakeClient.emit({
            method: "item/agentMessage/delta",
            params: {
                delta: "Still streaming",
            },
        });
        fakeClient.emit({
            method: "turn/completed",
            params: {
                turn: {
                    status: "completed",
                },
            },
        });

        await sendPromise;

        expect(senderEvents.map((event) => event.type)).toEqual([
            "run.started",
            "message.started",
            "message.delta",
            "message.completed",
            "run.completed",
        ]);
        expect(observerEvents.map((event) => event.type)).toEqual([
            "run.started",
            "message.started",
            "message.delta",
            "message.completed",
            "run.completed",
        ]);
        expect(persistence.recoverStaleRunCalls).toHaveLength(0);
    });

    test("serializes concurrent runtime initialization for the same agent conversation", async () => {
        const config = createConfig();
        const persistence = createPersistence(null);
        const clients: FakeCodexClient[] = [];
        let releaseInitialization!: () => void;
        const initializationGate = new Promise<void>((resolve) => {
            releaseInitialization = resolve;
        });

        const manager = new CodexRuntimeManager({
            getConfig: () => config,
            persistence: persistence as unknown as RuntimePersistenceClient,
            createClient: () => {
                const client = new FakeCodexClient({
                    startedThreadId: "thread-fresh",
                    autoComplete: false,
                });
                client.initialize = async () => {
                    await initializationGate;
                };
                clients.push(client);
                return client;
            },
        });

        const firstSend = manager.sendMessage({
            userId: "user-1",
            subscriberId: "socket-1",
            command: createCommand(),
            sendEvent: () => undefined,
        });
        await Bun.sleep(0);

        const secondSendError = manager
            .sendMessage({
                userId: "user-1",
                subscriberId: "socket-2",
                command: createCommand(),
                sendEvent: () => undefined,
            })
            .then(
                () => null,
                (error) =>
                    error instanceof Error ? error.message : String(error),
            );

        await Bun.sleep(0);
        expect(clients).toHaveLength(1);

        releaseInitialization();
        await Bun.sleep(0);

        expect(await secondSendError).toBe(
            "Conversation already has an active run.",
        );

        clients[0]?.emit({
            method: "turn/completed",
            params: {
                turn: {
                    status: "completed",
                },
            },
        });

        await firstSend;
        expect(clients).toHaveLength(1);
    });

    test("promotes Codex agent reasoning into an assistant status message before output", async () => {
        const config = createConfig();
        const persistence = createPersistence(null);
        const fakeClient = new FakeCodexClient({
            startedThreadId: "thread-fresh",
            autoComplete: false,
        });
        const events: Array<{
            type: string;
            payload: Record<string, unknown>;
        }> = [];
        const manager = new CodexRuntimeManager({
            getConfig: () => config,
            persistence: persistence as unknown as RuntimePersistenceClient,
            createClient: () => fakeClient,
        });

        const sendPromise = manager.sendMessage({
            userId: "user-1",
            subscriberId: "socket-1",
            command: createCommand(),
            sendEvent: (event) => {
                events.push(event);
            },
        });

        await Bun.sleep(0);
        fakeClient.emit({
            method: "codex/event/agent_reasoning",
            params: {
                id: "turn-1",
                msg: {
                    type: "agent_reasoning",
                    text: "I’m surveying the workspace first.",
                },
            },
        });
        fakeClient.emit({
            method: "item/agentMessage/delta",
            params: {
                delta: "Final answer",
            },
        });
        await Bun.sleep(300);
        fakeClient.emit({
            method: "turn/completed",
            params: {
                turn: {
                    status: "completed",
                },
            },
        });
        await sendPromise;

        expect(events.map((event) => event.type)).toEqual([
            "run.started",
            "message.started",
            "message.started",
            "message.completed",
            "message.started",
            "message.delta",
            "message.completed",
            "run.completed",
        ]);
        expect(persistence.messageStartedCalls).toHaveLength(1);
        expect(persistence.messageStartedCalls[0]).toMatchObject({
            previousAssistantMessageLocalId: "assistant-1",
            previousKind: "assistant_status",
            kind: "assistant_message",
            runMessageIndex: 1,
        });
    });

    test("waits for assistant output transition persistence before completing a run", async () => {
        const config = createConfig();
        const persistence = createPersistence(null);
        let resolveMessageStarted: (() => void) | null = null;
        const messageStartedPending = new Promise<void>((resolve) => {
            resolveMessageStarted = resolve;
        });
        persistence.messageStarted = async (
            payload: Record<string, unknown>,
        ) => {
            persistence.messageStartedCalls.push(payload);
            await messageStartedPending;
        };

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
            userId: "user-1",
            subscriberId: "socket-1",
            command: createCommand(),
            sendEvent: () => {},
        });

        await Bun.sleep(0);
        fakeClient.emit({
            method: "codex/event/agent_reasoning",
            params: {
                msg: {
                    type: "agent_reasoning",
                    text: "Preparing a concise reply",
                },
            },
        });
        fakeClient.emit({
            method: "item/agentMessage/delta",
            params: {
                delta: "Hello!",
            },
        });
        fakeClient.emit({
            method: "turn/completed",
            params: {
                turn: {
                    status: "completed",
                },
            },
        });

        await Bun.sleep(0);
        expect(persistence.messageStartedCalls).toHaveLength(1);
        expect(persistence.runCompletedCalls).toHaveLength(0);

        expect(resolveMessageStarted).not.toBeNull();
        resolveMessageStarted!();
        await sendPromise;

        expect(persistence.runCompletedCalls).toHaveLength(1);
        expect(persistence.runCompletedCalls[0]).toMatchObject({
            assistantMessageLocalId: expect.any(String),
            content: "Hello!",
        });
        expect(
            persistence.runCompletedCalls[0]?.assistantMessageLocalId,
        ).not.toBe("assistant-1");
    });

    test("keeps report-style assistant text in a single assistant message without heuristics", async () => {
        const config = createConfig();
        const persistence = createPersistence(null);
        const fakeClient = new FakeCodexClient({
            startedThreadId: "thread-fresh",
            autoComplete: false,
        });
        const events: Array<{
            type: string;
            payload: Record<string, unknown>;
        }> = [];
        const manager = new CodexRuntimeManager({
            getConfig: () => config,
            persistence: persistence as unknown as RuntimePersistenceClient,
            createClient: () => fakeClient,
        });

        const sendPromise = manager.sendMessage({
            userId: "user-1",
            subscriberId: "socket-1",
            command: createCommand(),
            sendEvent: (event) => {
                events.push(event);
            },
        });

        await Bun.sleep(0);
        fakeClient.emit({
            method: "item/agentMessage/delta",
            params: {
                delta: "I’m surveying the workspace first.\n\nReport\n- Done",
            },
        });
        await Bun.sleep(300);
        fakeClient.emit({
            method: "turn/completed",
            params: {
                turn: {
                    status: "completed",
                },
            },
        });
        await sendPromise;

        expect(events.map((event) => event.type)).toEqual([
            "run.started",
            "message.started",
            "message.delta",
            "message.completed",
            "run.completed",
        ]);
        expect(persistence.messageStartedCalls).toHaveLength(0);
    });

    test("treats turn/aborted as a terminal interrupted run", async () => {
        const config = createConfig();
        const persistence = createPersistence(null);
        const fakeClient = new FakeCodexClient({
            startedThreadId: "thread-fresh",
            autoComplete: false,
        });
        const events: Array<{
            type: string;
            payload: Record<string, unknown>;
        }> = [];
        const manager = new CodexRuntimeManager({
            getConfig: () => config,
            persistence: persistence as unknown as RuntimePersistenceClient,
            createClient: () => fakeClient,
        });

        const sendPromise = manager.sendMessage({
            userId: "user-1",
            subscriberId: "socket-1",
            command: createCommand(),
            sendEvent: (event) => {
                events.push(event);
            },
        });

        await Bun.sleep(0);
        fakeClient.emit({
            method: "item/agentMessage/delta",
            params: {
                delta: "Done enough",
            },
        });
        fakeClient.emit({
            method: "turn/aborted",
            params: {
                reason: "replaced",
            },
        });

        await sendPromise;

        expect(events.map((event) => event.type)).toEqual([
            "run.started",
            "message.started",
            "message.delta",
            "message.completed",
            "run.interrupted",
        ]);
        expect(persistence.runCompletedCalls).toHaveLength(0);
        expect(persistence.runInterruptedCalls).toHaveLength(1);
    });

    test("persists a failed run and errored binding when turn/start fails", async () => {
        const config = createConfig();
        const persistence = createPersistence(null);
        const fakeClient = new FakeCodexClient({
            turnStartError: new Error("turn/start failed: codex unavailable"),
        });
        const events: Array<{
            type: string;
            payload: Record<string, unknown>;
        }> = [];
        const manager = new CodexRuntimeManager({
            getConfig: () => config,
            persistence: persistence as unknown as RuntimePersistenceClient,
            createClient: () => fakeClient,
        });

        await manager.sendMessage({
            userId: "user-1",
            subscriberId: "socket-1",
            command: createCommand(),
            sendEvent: (event) => {
                events.push(event);
            },
        });

        expect(events.map((event) => event.type)).toEqual([
            "run.started",
            "message.started",
            "run.failed",
        ]);
        expect(persistence.runFailedCalls).toHaveLength(1);
        expect(persistence.runFailedCalls[0]).toMatchObject({
            conversationLocalId: "chat-1",
            assistantMessageLocalId: "assistant-1",
            errorMessage: "turn/start failed: codex unavailable",
        });
        expect(persistence.runtimeBindingCalls.at(-1)).toMatchObject({
            conversationLocalId: "chat-1",
            status: "errored",
            lastError: "turn/start failed: codex unavailable",
            activeRunId: null,
        });
        expect(fakeClient.stopped).toBe(true);
    });

    test("persists crashed runs when the runtime exits mid-stream", async () => {
        const config = createConfig();
        const persistence = createPersistence(null);
        const fakeClient = new FakeCodexClient({
            startedThreadId: "thread-fresh",
            autoComplete: false,
        });
        const events: Array<{
            type: string;
            payload: Record<string, unknown>;
        }> = [];
        const manager = new CodexRuntimeManager({
            getConfig: () => config,
            persistence: persistence as unknown as RuntimePersistenceClient,
            createClient: () => fakeClient,
        });

        const sendPromise = manager.sendMessage({
            userId: "user-1",
            subscriberId: "socket-1",
            command: createCommand(),
            sendEvent: (event) => {
                events.push(event);
            },
        });

        await Bun.sleep(0);
        fakeClient.emit({
            method: "item/agentMessage/delta",
            params: {
                delta: "Partial crash output",
            },
        });
        await Bun.sleep(300);
        fakeClient.emitExit(new Error("Codex process exited unexpectedly"));
        await sendPromise;

        expect(events.map((event) => event.type)).toEqual([
            "run.started",
            "message.started",
            "message.delta",
            "message.completed",
            "run.failed",
        ]);
        expect(persistence.runFailedCalls).toHaveLength(1);
        expect(persistence.runFailedCalls[0]).toMatchObject({
            content: "Partial crash output",
            errorMessage: "Codex process exited unexpectedly",
        });
        expect(persistence.runtimeBindingCalls.at(-1)).toMatchObject({
            status: "errored",
            lastError: "Codex process exited unexpectedly",
            activeRunId: null,
        });
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
                userId: "user-1",
                conversationId: "chat-1",
                agentId: "agent-1",
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
            userId: "user-1",
            subscriberId: "socket-1",
            command: createCommand(),
            sendEvent: () => undefined,
        });

        expect(clients).toHaveLength(2);
        expect(clients[0]?.stopped).toBe(true);
        expect(clients[1]?.stopped).toBe(false);
    });

    test("rebuilds copied workspaces when the agent rootPath changes in config", async () => {
        const sandboxRoot = makeTempDir("sandbox");
        const firstRoot = makeTempDir("agent-root-a");
        const secondRoot = makeTempDir("agent-root-b");
        writeFileSync(path.join(firstRoot, "version.txt"), "first");
        writeFileSync(path.join(secondRoot, "version.txt"), "second");

        const config = createConfig();
        config.sandboxRoot = sandboxRoot;
        config.agents[0] = {
            ...config.agents[0]!,
            rootPath: firstRoot,
            workspaceMode: "copy-on-conversation",
        };

        const workspaceManager = createWorkspaceManager(() => config);
        const persistence = createPersistence(null);
        const sandboxesUsed: string[] = [];
        const manager = new CodexRuntimeManager({
            getConfig: () => config,
            persistence: persistence as unknown as RuntimePersistenceClient,
            workspaceManager,
            createClient: (params) => {
                sandboxesUsed.push(params.agent.rootPath);
                return new FakeCodexClient();
            },
        });

        await manager.sendMessage({
            userId: "user-1",
            subscriberId: "socket-1",
            command: createCommand(),
            sendEvent: () => undefined,
        });

        const sandboxPath = sandboxesUsed[0];
        if (!sandboxPath) {
            throw new Error("Expected the first sandbox path");
        }

        expect(existsSync(sandboxPath)).toBe(true);
        expect(
            readFileSync(path.join(sandboxPath, "version.txt"), "utf8"),
        ).toBe("first");

        config.agents[0] = {
            ...config.agents[0]!,
            rootPath: secondRoot,
        };

        await manager.sendMessage({
            userId: "user-1",
            subscriberId: "socket-1",
            command: createCommand(),
            sendEvent: () => undefined,
        });

        expect(sandboxesUsed).toHaveLength(2);
        expect(sandboxesUsed[1]).toBe(sandboxPath);
        expect(
            readFileSync(path.join(sandboxPath, "version.txt"), "utf8"),
        ).toBe("second");
    });

    test("does not resume persisted threads after resetting a copied workspace", async () => {
        const sandboxRoot = makeTempDir("sandbox");
        const firstRoot = makeTempDir("agent-root-a");
        const secondRoot = makeTempDir("agent-root-b");
        writeFileSync(path.join(firstRoot, "version.txt"), "first");
        writeFileSync(path.join(secondRoot, "version.txt"), "second");

        const config = createConfig();
        config.sandboxRoot = sandboxRoot;
        config.agents[0] = {
            ...config.agents[0]!,
            rootPath: firstRoot,
            workspaceMode: "copy-on-conversation",
        };

        const workspaceManager = createWorkspaceManager(() => config);
        const persistence = createPersistence(null);
        let bindingThreadId: string | null = null;
        persistence.readRuntimeBinding = async (payload) => {
            persistence.readRuntimeBindingCalls.push(payload);
            if (!bindingThreadId) {
                return null;
            }

            return {
                provider: "codex-default",
                status: "idle" as const,
                providerThreadId: bindingThreadId,
                providerResumeToken: null,
                activeRunId: null,
                lastError: null,
                lastEventAt: null,
                expiresAt: null,
                workspaceMode: undefined,
                workspaceRootPath: undefined,
                workspaceCwd: undefined,
                updatedAt: Date.now(),
            };
        };

        const clients: FakeCodexClient[] = [];
        const manager = new CodexRuntimeManager({
            getConfig: () => config,
            persistence: persistence as unknown as RuntimePersistenceClient,
            workspaceManager,
            createClient: () => {
                const client = new FakeCodexClient();
                clients.push(client);
                return client;
            },
        });

        await manager.sendMessage({
            userId: "user-1",
            subscriberId: "socket-1",
            command: createCommand(),
            sendEvent: () => undefined,
        });

        bindingThreadId = "thread-stale";
        config.agents[0] = {
            ...config.agents[0]!,
            rootPath: secondRoot,
        };

        await manager.sendMessage({
            userId: "user-1",
            subscriberId: "socket-1",
            command: createCommand(),
            sendEvent: () => undefined,
        });

        expect(clients).toHaveLength(2);
        expect(clients[1]?.requests.map((request) => request.method)).toEqual([
            "thread/start",
            "turn/start",
        ]);
    });

    test("recycles copied runtimes when sandboxRoot changes", async () => {
        const firstSandboxRoot = makeTempDir("sandbox-a");
        const secondSandboxRoot = makeTempDir("sandbox-b");
        const agentRoot = makeTempDir("agent-root");
        writeFileSync(path.join(agentRoot, "version.txt"), "shared");

        const config = createConfig();
        config.sandboxRoot = firstSandboxRoot;
        config.agents[0] = {
            ...config.agents[0]!,
            rootPath: agentRoot,
            workspaceMode: "copy-on-conversation",
        };

        const workspaceManager = createWorkspaceManager(() => config);
        const sandboxesUsed: string[] = [];
        const clients: FakeCodexClient[] = [];
        const manager = new CodexRuntimeManager({
            getConfig: () => config,
            persistence: createPersistence(
                null,
            ) as unknown as RuntimePersistenceClient,
            workspaceManager,
            createClient: (params) => {
                sandboxesUsed.push(params.agent.rootPath);
                const client = new FakeCodexClient();
                clients.push(client);
                return client;
            },
        });

        await manager.sendMessage({
            userId: "user-1",
            subscriberId: "socket-1",
            command: createCommand(),
            sendEvent: () => undefined,
        });

        const firstSandboxPath = sandboxesUsed[0];
        if (!firstSandboxPath) {
            throw new Error("Expected the first sandbox path");
        }

        config.sandboxRoot = secondSandboxRoot;

        await manager.sendMessage({
            userId: "user-1",
            subscriberId: "socket-1",
            command: createCommand(),
            sendEvent: () => undefined,
        });

        const secondSandboxPath = sandboxesUsed[1];
        if (!secondSandboxPath) {
            throw new Error("Expected the second sandbox path");
        }

        expect(clients).toHaveLength(2);
        expect(clients[0]?.stopped).toBe(true);
        expect(secondSandboxPath).not.toBe(firstSandboxPath);
        expect(secondSandboxPath).toBe(
            path.join(secondSandboxRoot, "agent-1", "user-1", "chat-1"),
        );
        expect(existsSync(firstSandboxPath)).toBe(false);
        expect(existsSync(secondSandboxPath)).toBe(true);
    });

    test("does not delete another agent's copied workspace during runtime recycle", async () => {
        const sandboxRoot = makeTempDir("sandbox");
        const agentRootA = makeTempDir("agent-root-a");
        const agentRootB = makeTempDir("agent-root-b");
        writeFileSync(path.join(agentRootA, "version.txt"), "a");
        writeFileSync(path.join(agentRootB, "version.txt"), "b");

        const config = createConfig();
        config.sandboxRoot = sandboxRoot;
        config.agents = [
            {
                ...config.agents[0]!,
                id: "agent-1",
                rootPath: agentRootA,
                workspaceMode: "copy-on-conversation",
            },
            {
                ...config.agents[0]!,
                id: "agent-2",
                rootPath: agentRootB,
                workspaceMode: "copy-on-conversation",
            },
        ];

        const workspaceManager = createWorkspaceManager(() => config);
        const persistence = createPersistence(null);
        const clients: FakeCodexClient[] = [];
        const manager = new CodexRuntimeManager({
            getConfig: () => config,
            persistence: persistence as unknown as RuntimePersistenceClient,
            workspaceManager,
            createClient: () => {
                const client = new FakeCodexClient();
                clients.push(client);
                return client;
            },
        });

        await manager.sendMessage({
            userId: "user-1",
            subscriberId: "socket-1",
            command: createCommand(),
            sendEvent: () => undefined,
        });
        const firstWorkspace = await workspaceManager.ensureWorkspace(
            config.agents[0]!,
            "user-1",
            "chat-1",
        );

        await manager.sendMessage({
            userId: "user-1",
            subscriberId: "socket-1",
            command: {
                ...createCommand(),
                payload: {
                    ...createCommand().payload,
                    agentId: "agent-2",
                },
            },
            sendEvent: () => undefined,
        });

        const secondWorkspace = await workspaceManager.ensureWorkspace(
            config.agents[1]!,
            "user-1",
            "chat-1",
        );

        expect(clients).toHaveLength(2);
        expect(clients[0]?.stopped).toBe(false);
        expect(existsSync(firstWorkspace)).toBe(true);
        expect(existsSync(secondWorkspace)).toBe(true);
        expect(firstWorkspace).not.toBe(secondWorkspace);
        expect(
            readFileSync(path.join(firstWorkspace, "version.txt"), "utf8"),
        ).toBe("a");
        expect(
            readFileSync(path.join(secondWorkspace, "version.txt"), "utf8"),
        ).toBe("b");
    });

    test("does not resume persisted threads after reopening a shared runtime with a changed rootPath", async () => {
        const firstRoot = makeTempDir("agent-root-a");
        const secondRoot = makeTempDir("agent-root-b");

        const config = createConfig();
        config.agents[0] = {
            ...config.agents[0]!,
            rootPath: secondRoot,
            workspaceMode: "shared",
        };

        const persistence = createPersistence({
            provider: "codex-default",
            status: "idle",
            providerThreadId: "thread-stale",
            workspaceMode: "shared",
            workspaceRootPath: firstRoot,
            workspaceCwd: firstRoot,
        });
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
            userId: "user-1",
            subscriberId: "socket-1",
            command: createCommand(),
            sendEvent: () => undefined,
        });

        expect(clients).toHaveLength(1);
        expect(clients[0]?.requests.map((request) => request.method)).toEqual([
            "thread/start",
            "turn/start",
        ]);
    });

    test("does not resume persisted threads after reopening a copied runtime with a changed rootPath", async () => {
        const sandboxRoot = makeTempDir("sandbox");
        const firstRoot = makeTempDir("agent-root-a");
        const secondRoot = makeTempDir("agent-root-b");
        writeFileSync(path.join(firstRoot, "version.txt"), "first");
        writeFileSync(path.join(secondRoot, "version.txt"), "second");

        const config = createConfig();
        config.sandboxRoot = sandboxRoot;
        config.agents[0] = {
            ...config.agents[0]!,
            rootPath: firstRoot,
            workspaceMode: "copy-on-conversation",
        };

        const workspaceManager = createWorkspaceManager(() => config);
        const initialWorkspace = await workspaceManager.ensureWorkspace(
            config.agents[0]!,
            "user-1",
            "chat-1",
        );

        config.agents[0] = {
            ...config.agents[0]!,
            rootPath: secondRoot,
        };

        const persistence = createPersistence({
            provider: "codex-default",
            status: "idle",
            providerThreadId: "thread-stale",
            workspaceMode: "copy-on-conversation",
            workspaceRootPath: firstRoot,
            workspaceCwd: initialWorkspace,
        });
        const clients: FakeCodexClient[] = [];
        const manager = new CodexRuntimeManager({
            getConfig: () => config,
            persistence: persistence as unknown as RuntimePersistenceClient,
            workspaceManager,
            createClient: () => {
                const client = new FakeCodexClient();
                clients.push(client);
                return client;
            },
        });

        await manager.sendMessage({
            userId: "user-1",
            subscriberId: "socket-1",
            command: createCommand(),
            sendEvent: () => undefined,
        });

        expect(clients).toHaveLength(1);
        expect(clients[0]?.requests.map((request) => request.method)).toEqual([
            "thread/start",
            "turn/start",
        ]);
        expect(
            readFileSync(path.join(initialWorkspace, "version.txt"), "utf8"),
        ).toBe("second");
    });

    test("does not resume persisted threads after a copied workspace is recreated", async () => {
        const sandboxRoot = makeTempDir("sandbox");
        const agentRoot = makeTempDir("agent-root");
        writeFileSync(path.join(agentRoot, "version.txt"), "shared");

        const config = createConfig();
        config.sandboxRoot = sandboxRoot;
        config.agents[0] = {
            ...config.agents[0]!,
            rootPath: agentRoot,
            workspaceMode: "copy-on-conversation",
        };

        const workspaceManager = createWorkspaceManager(() => config);
        const initialWorkspace = await workspaceManager.ensureWorkspace(
            config.agents[0]!,
            "user-1",
            "chat-1",
        );
        rmSync(initialWorkspace, { force: true, recursive: true });

        const persistence = createPersistence({
            provider: "codex-default",
            status: "idle",
            providerThreadId: "thread-stale",
            workspaceMode: "copy-on-conversation",
            workspaceRootPath: agentRoot,
            workspaceCwd: initialWorkspace,
        });
        const clients: FakeCodexClient[] = [];
        const manager = new CodexRuntimeManager({
            getConfig: () => config,
            persistence: persistence as unknown as RuntimePersistenceClient,
            workspaceManager,
            createClient: () => {
                const client = new FakeCodexClient();
                clients.push(client);
                return client;
            },
        });

        await manager.sendMessage({
            userId: "user-1",
            subscriberId: "socket-1",
            command: createCommand(),
            sendEvent: () => undefined,
        });

        expect(clients).toHaveLength(1);
        expect(clients[0]?.requests.map((request) => request.method)).toEqual([
            "thread/start",
            "turn/start",
        ]);
        expect(existsSync(initialWorkspace)).toBe(true);
        expect(
            readFileSync(path.join(initialWorkspace, "version.txt"), "utf8"),
        ).toBe("shared");
    });

    test("deletes copied workspaces even after the agent is disabled", async () => {
        const sandboxRoot = makeTempDir("sandbox");
        const agentRoot = makeTempDir("agent-root");
        writeFileSync(path.join(agentRoot, "version.txt"), "first");

        const config = createConfig();
        config.sandboxRoot = sandboxRoot;
        config.agents[0] = {
            ...config.agents[0]!,
            rootPath: agentRoot,
            workspaceMode: "copy-on-conversation",
        };

        const workspaceManager = createWorkspaceManager(() => config);
        const persistence = createPersistence(null);
        const manager = new CodexRuntimeManager({
            getConfig: () => config,
            persistence: persistence as unknown as RuntimePersistenceClient,
            workspaceManager,
        });
        const workspacePath = await workspaceManager.ensureWorkspace(
            config.agents[0]!,
            "user-1",
            "chat-1",
        );
        const client = new FakeCodexClient();
        let rejectedMessage: string | null = null;

        (
            manager as unknown as {
                runtimes: Map<string, Record<string, unknown>>;
            }
        ).runtimes.set(JSON.stringify(["user-1", "agent-1", "chat-1"]), {
            agentId: "agent-1",
            activeTurn: {
                pendingDeltaFlush: null,
                reject: (error: Error) => {
                    rejectedMessage = error.message;
                },
            },
            idleTimer: null,
            client,
        });

        expect(existsSync(workspacePath)).toBe(true);

        config.agents[0] = {
            ...config.agents[0]!,
            enabled: false,
        };

        await manager.deleteConversationWorkspace({
            userId: "user-1",
            conversationId: "chat-1",
            agentId: "agent-1",
        });

        if (rejectedMessage === null) {
            throw new Error("Expected the active turn to be rejected.");
        }
        if (rejectedMessage !== "Conversation deleted during active turn.") {
            throw new Error(
                `Expected active turn rejection, received ${String(rejectedMessage)}`,
            );
        }
        expect(client.stopped).toBe(true);
        expect(existsSync(workspacePath)).toBe(false);
        expect(persistence.chatExistsCalls).toEqual([
            {
                userId: "user-1",
                agentId: "agent-1",
                localId: "chat-1",
            },
        ]);
    });

    test("deletes the requested agent workspace even when another agent runtime is live for the same conversation id", async () => {
        const sandboxRoot = makeTempDir("sandbox");
        const agentRootA = makeTempDir("agent-root-a");
        const agentRootB = makeTempDir("agent-root-b");
        writeFileSync(path.join(agentRootA, "version.txt"), "a");
        writeFileSync(path.join(agentRootB, "version.txt"), "b");

        const config = createConfig();
        config.sandboxRoot = sandboxRoot;
        config.agents = [
            {
                ...config.agents[0]!,
                id: "agent-1",
                rootPath: agentRootA,
                workspaceMode: "copy-on-conversation",
            },
            {
                ...config.agents[0]!,
                id: "agent-2",
                rootPath: agentRootB,
                workspaceMode: "copy-on-conversation",
            },
        ];

        const workspaceManager = createWorkspaceManager(() => config);
        const persistence = createPersistence(null);
        const manager = new CodexRuntimeManager({
            getConfig: () => config,
            persistence: persistence as unknown as RuntimePersistenceClient,
            workspaceManager,
        });
        const workspacePath = await workspaceManager.ensureWorkspace(
            config.agents[1]!,
            "user-1",
            "chat-1",
        );
        const client = new FakeCodexClient();

        (
            manager as unknown as {
                runtimes: Map<string, Record<string, unknown>>;
            }
        ).runtimes.set("user-1:chat-1", {
            agentId: "agent-1",
            activeTurn: null,
            idleTimer: null,
            client,
        });

        expect(existsSync(workspacePath)).toBe(true);

        await manager.deleteConversationWorkspace({
            userId: "user-1",
            conversationId: "chat-1",
            agentId: "agent-2",
        });

        expect(client.stopped).toBe(false);
        expect(existsSync(workspacePath)).toBe(false);
        expect(persistence.chatExistsCalls).toEqual([
            {
                userId: "user-1",
                agentId: "agent-2",
                localId: "chat-1",
            },
        ]);
    });
});
