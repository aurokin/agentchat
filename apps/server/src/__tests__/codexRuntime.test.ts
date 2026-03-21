import {
    existsSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    symlinkSync,
    writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, test } from "bun:test";

import type { AgentchatConfig } from "../config.ts";
import type { RuntimePersistenceClient } from "../runtimePersistence.ts";
import type { ServerEvent } from "../socketProtocol.ts";
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

async function withTempStateHome<T>(run: () => Promise<T>): Promise<T> {
    const previousXdgStateHome = process.env.XDG_STATE_HOME;
    process.env.XDG_STATE_HOME = makeTempDir("xdg-state");
    try {
        return await run();
    } finally {
        if (previousXdgStateHome === undefined) {
            delete process.env.XDG_STATE_HOME;
        } else {
            process.env.XDG_STATE_HOME = previousXdgStateHome;
        }
    }
}

function createConfig(): AgentchatConfig {
    return {
        version: 1,
        stateId: "test-state",
        instanceKey: "instance-test",
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
    initializePromise?: Promise<void>;
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
        await this.options.initializePromise;
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

    async stop(): Promise<void> {
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
    const chatId = "chats:chat-1";
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
            return {
                chatId,
                binding: binding
                    ? {
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
                      }
                    : null,
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

function createDeferred<T>(): {
    promise: Promise<T>;
    resolve: (value: T | PromiseLike<T>) => void;
    reject: (reason?: unknown) => void;
} {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((promiseResolve, promiseReject) => {
        resolve = promiseResolve;
        reject = promiseReject;
    });
    return { promise, resolve, reject };
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

    test("does not resume legacy shared bindings before shared-root history exists", async () => {
        await withTempStateHome(async () => {
            const config = createConfig();
            const persistence = createPersistence({
                provider: "codex-default",
                providerThreadId: "thread-existing",
                updatedAt: Date.now() - 60_000,
            });
            const fakeClient = new FakeCodexClient({
                resumedThreadId: "thread-existing",
            });
            const manager = new CodexRuntimeManager({
                getConfig: () => config,
                persistence: persistence as unknown as RuntimePersistenceClient,
                createClient: () => fakeClient,
                stateId: "legacy-shared-runtime",
            });

            await manager.sendMessage({
                userId: "user-1",
                subscriberId: "socket-1",
                command: createCommand(),
                sendEvent: () => undefined,
            });

            expect(
                fakeClient.requests.map((request) => request.method),
            ).toEqual(["thread/start", "turn/start"]);
        });
    });

    test("does not resume legacy shared bindings after the agent root path changes across checkout relocations", async () => {
        await withTempStateHome(async () => {
            const initialConfig = createConfig();
            const initialPersistence = createPersistence({
                provider: "codex-default",
                providerThreadId: "thread-existing",
                updatedAt: Date.now() - 60_000,
            });
            const initialClient = new FakeCodexClient({
                resumedThreadId: "thread-existing",
            });
            const initialManager = new CodexRuntimeManager({
                getConfig: () => initialConfig,
                persistence:
                    initialPersistence as unknown as RuntimePersistenceClient,
                createClient: () => initialClient,
                stateId: "release-runtime",
            });

            await initialManager.sendMessage({
                userId: "user-1",
                subscriberId: "socket-1",
                command: createCommand(),
                sendEvent: () => undefined,
            });

            const updatedConfig = createConfig();
            updatedConfig.agents[0] = {
                ...updatedConfig.agents[0]!,
                rootPath: "/tmp/agent-1-renamed",
            };
            const updatedPersistence = createPersistence({
                provider: "codex-default",
                providerThreadId: "thread-existing",
                updatedAt: Date.now() - 60_000,
            });
            const updatedClient = new FakeCodexClient({
                startedThreadId: "thread-new",
            });
            const updatedManager = new CodexRuntimeManager({
                getConfig: () => updatedConfig,
                persistence:
                    updatedPersistence as unknown as RuntimePersistenceClient,
                createClient: () => updatedClient,
                stateId: "release-runtime",
            });

            await updatedManager.sendMessage({
                userId: "user-1",
                subscriberId: "socket-1",
                command: createCommand(),
                sendEvent: () => undefined,
            });

            expect(
                updatedClient.requests.map((request) => request.method),
            ).toEqual(["thread/start", "turn/start"]);
        });
    });

    test("keeps resuming legacy shared bindings across unrelated config edits", async () => {
        await withTempStateHome(async () => {
            const config = createConfig();
            const initialPersistence = createPersistence({
                provider: "codex-default",
                providerThreadId: null,
                updatedAt: Date.now(),
            });
            const initialClient = new FakeCodexClient({
                startedThreadId: "thread-fresh",
            });
            const initialManager = new CodexRuntimeManager({
                getConfig: () => config,
                persistence:
                    initialPersistence as unknown as RuntimePersistenceClient,
                createClient: () => initialClient,
                stateId: "legacy-shared-runtime",
            });

            await initialManager.sendMessage({
                userId: "user-1",
                subscriberId: "socket-1",
                command: createCommand(),
                sendEvent: () => undefined,
            });

            const updatedPersistence = createPersistence({
                provider: "codex-default",
                providerThreadId: "thread-fresh",
                updatedAt: Date.now(),
            });
            const updatedClient = new FakeCodexClient({
                resumedThreadId: "thread-fresh",
            });
            const updatedManager = new CodexRuntimeManager({
                getConfig: () => config,
                persistence:
                    updatedPersistence as unknown as RuntimePersistenceClient,
                createClient: () => updatedClient,
                stateId: "legacy-shared-runtime",
            });

            await updatedManager.sendMessage({
                userId: "user-1",
                subscriberId: "socket-1",
                command: createCommand(),
                sendEvent: () => undefined,
            });

            expect(
                updatedClient.requests.map((request) => request.method),
            ).toEqual(["thread/resume", "turn/start"]);
        });
    });

    test("keeps legacy shared-root history isolated per runtime instance", async () => {
        await withTempStateHome(async () => {
            const releaseAConfig = createConfig();
            releaseAConfig.instanceKey = "instance-a";
            releaseAConfig.agents[0] = {
                ...releaseAConfig.agents[0]!,
                rootPath: "/tmp/release-a/agent-1",
            };
            const releaseAInitialClient = new FakeCodexClient({
                startedThreadId: "thread-a",
            });
            const releaseAInitialManager = new CodexRuntimeManager({
                getConfig: () => releaseAConfig,
                persistence: createPersistence({
                    provider: "codex-default",
                    providerThreadId: "thread-a-legacy",
                    updatedAt: Date.now() - 60_000,
                }) as unknown as RuntimePersistenceClient,
                createClient: () => releaseAInitialClient,
                stateId: "shared-install",
            });

            await releaseAInitialManager.sendMessage({
                userId: "user-1",
                subscriberId: "socket-1",
                command: createCommand(),
                sendEvent: () => undefined,
            });

            expect(
                releaseAInitialClient.requests.map((request) => request.method),
            ).toEqual(["thread/start", "turn/start"]);

            const releaseAUpdatedAt = Date.now() + 1_000;

            const releaseBConfig = createConfig();
            releaseBConfig.instanceKey = "instance-b";
            releaseBConfig.agents[0] = {
                ...releaseBConfig.agents[0]!,
                rootPath: "/tmp/release-b/agent-1",
            };
            const releaseBClient = new FakeCodexClient({
                startedThreadId: "thread-b",
            });
            const releaseBManager = new CodexRuntimeManager({
                getConfig: () => releaseBConfig,
                persistence: createPersistence({
                    provider: "codex-default",
                    providerThreadId: "thread-b-existing",
                    updatedAt: Date.now() - 60_000,
                }) as unknown as RuntimePersistenceClient,
                createClient: () => releaseBClient,
                stateId: "shared-install",
            });

            await releaseBManager.sendMessage({
                userId: "user-1",
                subscriberId: "socket-1",
                command: createCommand(),
                sendEvent: () => undefined,
            });

            expect(
                releaseBClient.requests.map((request) => request.method),
            ).toEqual(["thread/start", "turn/start"]);

            const releaseAResumeClient = new FakeCodexClient({
                resumedThreadId: "thread-a",
            });
            const releaseAResumeManager = new CodexRuntimeManager({
                getConfig: () => releaseAConfig,
                persistence: createPersistence({
                    provider: "codex-default",
                    providerThreadId: "thread-a",
                    updatedAt: releaseAUpdatedAt,
                }) as unknown as RuntimePersistenceClient,
                createClient: () => releaseAResumeClient,
                stateId: "shared-install",
            });

            await releaseAResumeManager.sendMessage({
                userId: "user-1",
                subscriberId: "socket-1",
                command: createCommand(),
                sendEvent: () => undefined,
            });

            expect(
                releaseAResumeClient.requests.map((request) => request.method),
            ).toEqual(["thread/resume", "turn/start"]);
        });
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
                    agentId: "agent-1",
                    conversationId: "chat-1",
                    runId: expect.any(String),
                    messageId: "assistant-1",
                },
            },
            {
                type: "message.started",
                payload: {
                    agentId: "agent-1",
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
                    agentId: "agent-1",
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

    test("does not fall back to a live runtime when legacy identity lookup is ambiguous", async () => {
        const config = createConfig();
        config.agents.push({
            ...config.agents[0]!,
            id: "agent-2",
            name: "Agent 2",
            rootPath: "/tmp/agent-2",
        });
        const fakeClient = new FakeCodexClient({
            startedThreadId: "thread-fresh",
            autoComplete: false,
        });
        const persistence = {
            ...createPersistence(null),
            async resolveConversationIdentity() {
                return {
                    agentId: null,
                    chatId: null,
                    ambiguous: true,
                };
            },
        };
        const manager = new CodexRuntimeManager({
            getConfig: () => config,
            persistence: persistence as unknown as RuntimePersistenceClient,
            createClient: () => fakeClient,
        });
        const command = createCommand();
        command.payload.agentId = "agent-2";

        const sendPromise = manager.sendMessage({
            userId: "user-1",
            subscriberId: "socket-1",
            command,
            sendEvent: () => undefined,
        });

        await Bun.sleep(0);

        await expect(
            manager.interrupt({
                userId: "user-1",
                conversationId: "chat-1",
            }),
        ).rejects.toThrow("ambiguous");

        expect(
            fakeClient.requests.filter(
                (request) => request.method === "turn/interrupt",
            ),
        ).toHaveLength(0);

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

    test("does not retain a subscriber that disconnects during async subscribe resolution", async () => {
        const config = createConfig();
        const identity = createDeferred<{
            agentId: string | null;
            chatId: string | null;
            ambiguous: boolean;
        }>();
        const persistence = {
            ...createPersistence(null),
            async resolveConversationIdentity() {
                return await identity.promise;
            },
        };
        const manager = new CodexRuntimeManager({
            getConfig: () => config,
            persistence: persistence as unknown as RuntimePersistenceClient,
            createClient: () => new FakeCodexClient(),
        });

        const subscribePromise = manager.subscribe({
            userId: "user-1",
            conversationId: "chat-1",
            subscriberId: "socket-1",
            sendEvent: () => undefined,
        }) as Promise<void>;

        manager.unsubscribe({
            subscriberId: "socket-1",
        });
        identity.resolve({
            agentId: "agent-1",
            chatId: "chats:chat-1",
            ambiguous: false,
        });

        await subscribePromise;

        expect(
            (
                manager as unknown as {
                    pendingSubscriptions: Map<string, Map<string, unknown>>;
                }
            ).pendingSubscriptions.size,
        ).toBe(0);
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

    test("ignores queued idle-expiration callbacks after a new run starts", async () => {
        const originalSetTimeout = globalThis.setTimeout;
        const originalClearTimeout = globalThis.clearTimeout;
        const scheduledCallbacks: Array<() => void> = [];

        globalThis.setTimeout = ((handler: TimerHandler) => {
            if (typeof handler === "function") {
                scheduledCallbacks.push(handler as () => void);
            }
            return Symbol("timeout") as unknown as ReturnType<
                typeof setTimeout
            >;
        }) as unknown as typeof setTimeout;
        globalThis.clearTimeout = (() => undefined) as typeof clearTimeout;

        try {
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
            const runtime: Record<string, unknown> = {
                key: JSON.stringify(["user-1", "agent-1", "chat-1"]),
                userId: "user-1",
                conversationId: "chat-1",
                agentId: "agent-1",
                modelId: "gpt-5.3-codex",
                provider: config.providers[0]!,
                agent: config.agents[0]!,
                cwd: config.agents[0]!.rootPath,
                client: fakeClient,
                threadId: "thread-fresh",
                activeTurn: null,
                idleTimer: null,
                subscribers: new Map(),
            };

            (
                manager as unknown as {
                    runtimes: Map<string, Record<string, unknown>>;
                    scheduleIdleExpiration: (
                        runtime: Record<string, unknown>,
                    ) => void;
                }
            ).runtimes.set(runtime.key as string, runtime);
            (
                manager as unknown as {
                    scheduleIdleExpiration: (
                        runtime: Record<string, unknown>,
                    ) => void;
                }
            ).scheduleIdleExpiration(runtime);

            const queuedIdleCallback = scheduledCallbacks[0];
            expect(queuedIdleCallback).toBeDefined();

            runtime.idleTimer = null;
            runtime.activeTurn = {
                reject: () => undefined,
            };

            queuedIdleCallback?.();

            expect(fakeClient.stopped).toBe(false);
            expect(
                (
                    manager as unknown as {
                        runtimes: Map<string, unknown>;
                    }
                ).runtimes.get(runtime.key as string),
            ).toBe(runtime);
        } finally {
            globalThis.setTimeout = originalSetTimeout;
            globalThis.clearTimeout = originalClearTimeout;
        }
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

    test("does not complete a turn after the runtime was deleted mid-finalization", async () => {
        const config = createConfig();
        const persistence = createPersistence(null);
        const fakeClient = new FakeCodexClient({
            startedThreadId: "thread-fresh",
            autoComplete: false,
        });
        const messageStartedDeferred = createDeferred<void>();
        persistence.messageStarted = async (
            payload: Record<string, unknown>,
        ) => {
            persistence.messageStartedCalls.push(payload);
            await messageStartedDeferred.promise;
        };
        const eventTypes: ServerEvent["type"][] = [];
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
                eventTypes.push(event.type);
            },
        });
        await Bun.sleep(0);

        fakeClient.emit({
            method: "codex/event/agent_reasoning",
            params: {
                msg: {
                    text: "Thinking",
                },
            },
        });
        fakeClient.emit({
            method: "item/agentMessage/delta",
            params: {
                delta: "Final answer",
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

        await waitFor(() => persistence.messageStartedCalls.length === 1);

        const deletePromise = manager.deleteConversationWorkspace({
            userId: "user-1",
            conversationId: "chat-1",
            agentId: "agent-1",
        });
        messageStartedDeferred.resolve();

        await sendPromise;
        await deletePromise;

        expect(persistence.runCompletedCalls).toHaveLength(0);
        expect(eventTypes.includes("run.completed")).toBe(false);
        expect(fakeClient.stopped).toBe(true);
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

    test("preserves existing subscribers when recycling an idle runtime", async () => {
        const config = createConfig();
        const clients: FakeCodexClient[] = [];
        const manager = new CodexRuntimeManager({
            getConfig: () => config,
            persistence: createPersistence(
                null,
            ) as unknown as RuntimePersistenceClient,
            createClient: () => {
                const client = new FakeCodexClient();
                clients.push(client);
                return client;
            },
        });

        const subscriberEvents: ServerEvent[] = [];

        await manager.sendMessage({
            userId: "user-1",
            subscriberId: "socket-1",
            command: createCommand(),
            sendEvent: () => undefined,
        });
        await manager.subscribe({
            userId: "user-1",
            conversationId: "chat-1",
            agentId: "agent-1",
            subscriberId: "socket-2",
            sendEvent: (event) => {
                subscriberEvents.push(event);
            },
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
        expect(
            subscriberEvents.some(
                (event) =>
                    event.type === "run.started" &&
                    event.payload.agentId === "agent-1" &&
                    event.payload.conversationId === "chat-1",
            ),
        ).toBe(true);
    });

    test("does not recycle an active runtime during config reload", async () => {
        const config = createConfig();
        const clients: FakeCodexClient[] = [];
        const manager = new CodexRuntimeManager({
            getConfig: () => config,
            persistence: createPersistence(
                null,
            ) as unknown as RuntimePersistenceClient,
            createClient: () => {
                const client = new FakeCodexClient({ autoComplete: false });
                clients.push(client);
                return client;
            },
        });

        const firstSendPromise = manager.sendMessage({
            userId: "user-1",
            subscriberId: "socket-1",
            command: createCommand(),
            sendEvent: () => undefined,
        });

        await waitFor(
            () =>
                (
                    manager as unknown as {
                        runtimes: Map<
                            string,
                            { activeTurn: Record<string, unknown> | null }
                        >;
                    }
                ).runtimes.get(JSON.stringify(["user-1", "agent-1", "chat-1"]))
                    ?.activeTurn !== null,
        );

        const currentAgent = config.agents[0];
        if (!currentAgent) {
            throw new Error("Expected agent config");
        }

        config.agents[0] = {
            ...currentAgent,
            rootPath: "/tmp/agent-1-next",
        };

        await expect(
            manager.sendMessage({
                userId: "user-1",
                subscriberId: "socket-1",
                command: createCommand(),
                sendEvent: () => undefined,
            }),
        ).rejects.toThrow("Conversation already has an active run.");

        expect(clients).toHaveLength(1);
        expect(clients[0]?.stopped).toBe(false);
        expect(
            (
                manager as unknown as {
                    runtimes: Map<
                        string,
                        { activeTurn: Record<string, unknown> | null }
                    >;
                }
            ).runtimes.get(JSON.stringify(["user-1", "agent-1", "chat-1"]))
                ?.activeTurn,
        ).not.toBeNull();

        clients[0]?.emit({
            method: "turn/completed",
            params: {
                turn: {
                    status: "completed",
                },
            },
        });
        await firstSendPromise;
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
            return {
                chatId: "chats:chat-1",
                binding: bindingThreadId
                    ? {
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
                      }
                    : null,
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

    test("does not recycle copied runtimes when sandboxRoot changes only by symlink alias", async () => {
        const sandboxRoot = makeTempDir("sandbox-real");
        const sandboxAliasParent = makeTempDir("sandbox-alias");
        const sandboxAlias = path.join(sandboxAliasParent, "linked-sandbox");
        symlinkSync(sandboxRoot, sandboxAlias, "dir");
        const agentRoot = makeTempDir("agent-root");
        writeFileSync(path.join(agentRoot, "version.txt"), "shared");

        const config = createConfig();
        config.sandboxRoot = sandboxAlias;
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

        const sandboxPath = sandboxesUsed[0];
        if (!sandboxPath) {
            throw new Error("Expected the copied sandbox path");
        }
        writeFileSync(path.join(sandboxPath, "session.txt"), "keep");

        config.sandboxRoot = sandboxRoot;

        await manager.sendMessage({
            userId: "user-1",
            subscriberId: "socket-1",
            command: createCommand(),
            sendEvent: () => undefined,
        });

        expect(clients).toHaveLength(1);
        expect(clients[0]?.stopped).toBe(false);
        expect(sandboxesUsed).toEqual([sandboxPath]);
        expect(
            readFileSync(path.join(sandboxPath, "session.txt"), "utf8"),
        ).toBe("keep");
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

    test("resumes persisted threads after reopening a shared runtime when rootPath changes only by symlink alias", async () => {
        const realRoot = makeTempDir("agent-root-real");
        const aliasParent = makeTempDir("agent-root-alias");
        const aliasRoot = path.join(aliasParent, "linked-root");
        symlinkSync(realRoot, aliasRoot, "dir");

        const config = createConfig();
        config.agents[0] = {
            ...config.agents[0]!,
            rootPath: realRoot,
            workspaceMode: "shared",
        };

        const persistence = createPersistence({
            provider: "codex-default",
            status: "idle",
            providerThreadId: "thread-existing",
            workspaceMode: "shared",
            workspaceRootPath: aliasRoot,
            workspaceCwd: aliasRoot,
        });
        const clients: FakeCodexClient[] = [];
        const manager = new CodexRuntimeManager({
            getConfig: () => config,
            persistence: persistence as unknown as RuntimePersistenceClient,
            createClient: () => {
                const client = new FakeCodexClient({
                    resumedThreadId: "thread-existing",
                });
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
            "thread/resume",
            "turn/start",
        ]);
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

    test("cancels pending runtime initialization when the conversation is deleted", async () => {
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
        const initializeDeferred = createDeferred<void>();
        const client = new FakeCodexClient({
            autoComplete: false,
            initializePromise: initializeDeferred.promise,
        });
        let createClientCalls = 0;
        const manager = new CodexRuntimeManager({
            getConfig: () => config,
            persistence: persistence as unknown as RuntimePersistenceClient,
            workspaceManager,
            createClient: () => {
                createClientCalls += 1;
                return client;
            },
        });
        const command = createCommand();
        const workspacePath = workspaceManager.getWorkspacePath(
            "agent-1",
            "user-1",
            command.payload.conversationId,
        );

        const sendPromise = manager.sendMessage({
            userId: "user-1",
            subscriberId: "sub-1",
            command,
            sendEvent: () => undefined,
        });
        const sendResultPromise = sendPromise.then(
            () => null,
            (error) => error,
        );

        await waitFor(
            () =>
                existsSync(workspacePath) &&
                (() => {
                    const pendingInitializations = (
                        manager as unknown as {
                            pendingRuntimeInitializations: Map<
                                string,
                                {
                                    client: FakeCodexClient | null;
                                }
                            >;
                        }
                    ).pendingRuntimeInitializations;
                    const pendingInitialization = [
                        ...pendingInitializations.values(),
                    ][0];
                    return (
                        pendingInitializations.size === 1 &&
                        pendingInitialization?.client === client
                    );
                })(),
        );

        const deletePromise = manager.deleteConversationWorkspace({
            userId: "user-1",
            conversationId: command.payload.conversationId,
            agentId: command.payload.agentId,
        });

        initializeDeferred.resolve();

        await expect(sendPromise).rejects.toThrow(
            "Conversation deleted during runtime initialization.",
        );
        await deletePromise;

        if (createClientCalls > 0) {
            expect(client.stopped).toBe(true);
        }
        expect(client.requests).toEqual([]);
        expect(existsSync(workspacePath)).toBe(false);
        expect(
            (
                manager as unknown as {
                    runtimes: Map<string, unknown>;
                }
            ).runtimes.size,
        ).toBe(0);
        expect(
            (
                manager as unknown as {
                    pendingRuntimeInitializations: Map<string, unknown>;
                }
            ).pendingRuntimeInitializations.size,
        ).toBe(0);
        expect(persistence.chatExistsCalls).toEqual([
            {
                userId: "user-1",
                agentId: "agent-1",
                localId: "chat-1",
            },
        ]);
    });

    test("does not publish a runtime cancelled immediately before registration", async () => {
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
        const client = new FakeCodexClient({
            startedThreadId: "thread-started",
            autoComplete: false,
        });
        const manager = new CodexRuntimeManager({
            getConfig: () => config,
            persistence: persistence as unknown as RuntimePersistenceClient,
            workspaceManager,
            createClient: () => client,
        });
        const command = createCommand();
        const runtimeKey = JSON.stringify([
            "user-1",
            command.payload.agentId,
            command.payload.conversationId,
        ]);
        const originalOnExit = client.onExit.bind(client);
        client.onExit = (handler: (error: Error) => void) => {
            originalOnExit(handler);
            (
                manager as unknown as {
                    cancelPendingRuntimeInitialization: (
                        key: string,
                        reason: Error,
                    ) => unknown;
                }
            ).cancelPendingRuntimeInitialization(
                runtimeKey,
                new Error(
                    "Conversation deleted during runtime initialization.",
                ),
            );
        };

        await expect(
            manager.sendMessage({
                userId: "user-1",
                subscriberId: "sub-1",
                command,
                sendEvent: () => undefined,
            }),
        ).rejects.toThrow(
            "Conversation deleted during runtime initialization.",
        );

        expect(client.stopped).toBe(true);
        expect(
            (
                manager as unknown as {
                    runtimes: Map<string, unknown>;
                }
            ).runtimes.size,
        ).toBe(0);
        expect(
            existsSync(
                workspaceManager.getWorkspacePath(
                    "agent-1",
                    "user-1",
                    command.payload.conversationId,
                ),
            ),
        ).toBe(false);
    });

    test("conversation delete does not wait forever on a hung runtime initialization", async () => {
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
        const initializeDeferred = createDeferred<void>();
        const client = new FakeCodexClient({
            autoComplete: false,
            initializePromise: initializeDeferred.promise,
        });
        const manager = new CodexRuntimeManager({
            getConfig: () => config,
            persistence: persistence as unknown as RuntimePersistenceClient,
            workspaceManager,
            createClient: () => client,
            pendingRuntimeDeleteWaitMs: 10,
        });
        const command = createCommand();
        const workspacePath = workspaceManager.getWorkspacePath(
            "agent-1",
            "user-1",
            command.payload.conversationId,
        );

        const sendPromise = manager.sendMessage({
            userId: "user-1",
            subscriberId: "sub-1",
            command,
            sendEvent: () => undefined,
        });
        const sendResultPromise = sendPromise.then(
            () => null,
            (error) => error,
        );

        await waitFor(
            () =>
                existsSync(workspacePath) &&
                (() => {
                    const pendingInitializations = (
                        manager as unknown as {
                            pendingRuntimeInitializations: Map<
                                string,
                                {
                                    client: FakeCodexClient | null;
                                }
                            >;
                        }
                    ).pendingRuntimeInitializations;
                    const pendingInitialization = [
                        ...pendingInitializations.values(),
                    ][0];
                    return (
                        pendingInitializations.size === 1 &&
                        pendingInitialization?.client === client
                    );
                })(),
        );

        const deleteResult = await Promise.race([
            manager
                .deleteConversationWorkspace({
                    userId: "user-1",
                    conversationId: command.payload.conversationId,
                    agentId: command.payload.agentId,
                })
                .then(() => "deleted"),
            new Promise<string>((resolve) => {
                setTimeout(() => resolve("timed-out"), 200);
            }),
        ]);

        expect(deleteResult).toBe("deleted");
        expect(client.stopped).toBe(true);
        expect(existsSync(workspacePath)).toBe(false);

        initializeDeferred.resolve();
        const sendError = await sendResultPromise;
        expect(sendError).toBeInstanceOf(Error);
        expect((sendError as Error).message).toContain(
            "Conversation deleted during runtime initialization.",
        );
    });

    test("cleans up copied workspace and client when conversation lookup fails during initialization", async () => {
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
        persistence.readRuntimeBinding = (async (
            payload: Parameters<typeof persistence.readRuntimeBinding>[0],
        ) => {
            persistence.readRuntimeBindingCalls.push(payload);
            return null;
        }) as unknown as typeof persistence.readRuntimeBinding;
        const client = new FakeCodexClient({
            autoComplete: false,
        });
        const manager = new CodexRuntimeManager({
            getConfig: () => config,
            persistence: persistence as unknown as RuntimePersistenceClient,
            workspaceManager,
            createClient: () => client,
        });
        const command = createCommand();
        const workspacePath = workspaceManager.getWorkspacePath(
            "agent-1",
            "user-1",
            command.payload.conversationId,
        );

        await expect(
            manager.sendMessage({
                userId: "user-1",
                subscriberId: "sub-1",
                command,
                sendEvent: () => undefined,
            }),
        ).rejects.toThrow("Conversation not found");

        expect(client.stopped).toBe(true);
        expect(client.requests).toEqual([]);
        expect(existsSync(workspacePath)).toBe(false);
        expect(
            (
                manager as unknown as {
                    runtimes: Map<string, unknown>;
                }
            ).runtimes.size,
        ).toBe(0);
    });

    test("preserves a reused copied workspace when runtime startup fails", async () => {
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
        const command = createCommand();
        const workspaceState = await workspaceManager.ensureWorkspaceState(
            config.agents[0]!,
            "user-1",
            command.payload.conversationId,
        );
        const workspacePath = workspaceState.path;
        writeFileSync(path.join(workspacePath, "user-note.txt"), "keep me");

        const initializeDeferred = createDeferred<void>();
        let createClientCalls = 0;
        const client = new FakeCodexClient({
            autoComplete: false,
            initializePromise: initializeDeferred.promise,
        });
        const manager = new CodexRuntimeManager({
            getConfig: () => config,
            persistence: createPersistence(
                null,
            ) as unknown as RuntimePersistenceClient,
            workspaceManager,
            createClient: () => {
                createClientCalls += 1;
                return client;
            },
        });

        const sendPromise = manager.sendMessage({
            userId: "user-1",
            subscriberId: "sub-1",
            command,
            sendEvent: () => undefined,
        });

        await waitFor(() => createClientCalls === 1);
        initializeDeferred.reject(new Error("initialize failed"));

        await expect(sendPromise).rejects.toThrow("initialize failed");

        expect(client.stopped).toBe(true);
        expect(existsSync(workspacePath)).toBe(true);
        expect(
            readFileSync(path.join(workspacePath, "user-note.txt"), "utf8"),
        ).toBe("keep me");
    });
});
