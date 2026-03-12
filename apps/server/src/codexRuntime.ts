import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import readline from "node:readline";

import type { AgentchatConfig, AgentConfig, ProviderConfig } from "./config.ts";
import type {
    ConversationHistoryEntry,
    ConversationSendCommand,
    ServerEvent,
} from "./socketProtocol.ts";
import type {
    PersistedRuntimeBinding,
    RuntimePersistenceClient,
} from "./runtimePersistence.ts";

type JsonRpcResponse = {
    id?: number | string;
    result?: unknown;
    error?: {
        message?: string;
    };
};

type JsonRpcNotification = {
    method?: string;
    params?: Record<string, unknown>;
};

type ActiveTurn = {
    runId: string;
    userId: string;
    triggerMessageId: string;
    assistantMessageId: string;
    turnId: string | null;
    text: string;
    nextSequence: number;
    lastPersistedContent: string;
    pendingDeltaFlush: ReturnType<typeof setTimeout> | null;
    sendEvent: (event: ServerEvent) => void;
    reject: (error: Error) => void;
    resolve: () => void;
};

type ConversationRuntime = {
    key: string;
    userSub: string;
    userId: string;
    conversationId: string;
    agentId: string;
    modelId: string;
    provider: ProviderConfig;
    agent: AgentConfig;
    client: CodexClient;
    threadId: string;
    activeTurn: ActiveTurn | null;
    idleTimer: ReturnType<typeof setTimeout> | null;
};

type ResolvedRuntimeResources = {
    agent: AgentConfig;
    provider: ProviderConfig;
};

type CodexClient = {
    initialize: () => Promise<void>;
    request: (method: string, params: unknown) => Promise<unknown>;
    onNotification: (
        handler: (notification: JsonRpcNotification) => void,
    ) => void;
    onExit: (handler: (error: Error) => void) => void;
    stop: () => void;
};

type CreateCodexClient = (params: {
    provider: ProviderConfig;
    agent: AgentConfig;
}) => CodexClient;

function invariant(condition: unknown, message: string): asserts condition {
    if (!condition) {
        throw new Error(message);
    }
}

function getRuntimeKey(userSub: string, conversationId: string): string {
    return `${userSub}:${conversationId}`;
}

function createServerEvent(
    type: ServerEvent["type"],
    payload: ServerEvent["payload"],
): ServerEvent {
    return { type, payload };
}

function toJsonLine(value: unknown): string {
    return `${JSON.stringify(value)}\n`;
}

function extractThreadId(result: unknown): string {
    const threadId = (result as { thread?: { id?: unknown } })?.thread?.id;
    invariant(typeof threadId === "string", "Codex thread id missing");
    return threadId;
}

function extractTurnId(result: unknown): string {
    const turnId = (result as { turn?: { id?: unknown } })?.turn?.id;
    invariant(typeof turnId === "string", "Codex turn id missing");
    return turnId;
}

const RECOVERABLE_THREAD_RESUME_ERROR_SNIPPETS = [
    "not found",
    "missing thread",
    "no such thread",
    "unknown thread",
    "does not exist",
    "is closing",
];

export function isRecoverableThreadResumeError(error: unknown): boolean {
    const message = (
        error instanceof Error ? error.message : String(error)
    ).toLowerCase();
    if (!message.includes("thread/resume")) {
        return false;
    }

    return RECOVERABLE_THREAD_RESUME_ERROR_SNIPPETS.some((snippet) =>
        message.includes(snippet),
    );
}

export function buildInitialTurnText(
    history: ConversationHistoryEntry[],
    content: string,
): string {
    const priorTurns = history
        .map((entry) => {
            const role =
                entry.role === "assistant"
                    ? "Assistant"
                    : entry.role === "system"
                      ? "System"
                      : "User";
            return `${role}: ${entry.content}`;
        })
        .join("\n\n");

    if (!priorTurns) {
        return content;
    }

    return [
        "Conversation so far:",
        priorTurns,
        "Continue naturally from the existing thread.",
        `Latest user message: ${content}`,
    ].join("\n\n");
}

class CodexAppServerClient {
    private readonly child: ChildProcessWithoutNullStreams;
    private readonly pending = new Map<
        number,
        {
            resolve: (result: unknown) => void;
            reject: (error: Error) => void;
        }
    >();
    private nextId = 1;
    private notificationHandler:
        | ((notification: JsonRpcNotification) => void)
        | null = null;
    private exitHandler: ((error: Error) => void) | null = null;
    private isStopping = false;
    private hasExited = false;

    constructor(params: { provider: ProviderConfig; agent: AgentConfig }) {
        const { provider } = params;
        this.child = spawn(provider.codex.command, provider.codex.args, {
            cwd: provider.codex.cwd ?? params.agent.rootPath,
            env: {
                ...process.env,
                ...provider.codex.baseEnv,
            },
            stdio: "pipe",
        });

        const stdout = readline.createInterface({
            input: this.child.stdout,
            crlfDelay: Infinity,
        });

        stdout.on("line", (line) => {
            if (!line.trim()) return;

            let parsed: JsonRpcResponse | JsonRpcNotification;
            try {
                parsed = JSON.parse(line) as
                    | JsonRpcResponse
                    | JsonRpcNotification;
            } catch (error) {
                console.error("[agentchat-server] invalid codex JSON", error);
                return;
            }

            if ("id" in parsed && parsed.id !== undefined) {
                const response = parsed as JsonRpcResponse;
                const requestId =
                    typeof response.id === "number"
                        ? response.id
                        : Number.parseInt(String(response.id), 10);
                const pending = this.pending.get(requestId);
                if (!pending) return;
                this.pending.delete(requestId);

                if (response.error?.message) {
                    pending.reject(new Error(response.error.message));
                    return;
                }

                pending.resolve(response.result);
                return;
            }

            this.notificationHandler?.(parsed as JsonRpcNotification);
        });

        this.child.stderr.on("data", (chunk) => {
            const text = chunk.toString().trim();
            if (text) {
                console.error(`[agentchat-server][codex] ${text}`);
            }
        });

        this.child.on("error", (error) => {
            if (this.hasExited) {
                return;
            }
            this.hasExited = true;
            for (const [, pending] of this.pending) {
                pending.reject(error);
            }
            this.pending.clear();
            if (!this.isStopping) {
                this.exitHandler?.(error);
            }
        });

        this.child.on("exit", (code, signal) => {
            if (this.hasExited) {
                return;
            }
            this.hasExited = true;
            const error = new Error(
                `Codex app-server exited (${code ?? "null"} / ${signal ?? "null"})`,
            );
            for (const [, pending] of this.pending) {
                pending.reject(error);
            }
            this.pending.clear();
            if (!this.isStopping) {
                this.exitHandler?.(error);
            }
        });
    }

    onNotification(handler: (notification: JsonRpcNotification) => void): void {
        this.notificationHandler = handler;
    }

    onExit(handler: (error: Error) => void): void {
        this.exitHandler = handler;
    }

    async initialize(): Promise<void> {
        await this.request("initialize", {
            clientInfo: {
                name: "agentchat_server",
                title: "Agentchat Server",
                version: "0.2.0",
            },
            capabilities: {
                experimentalApi: true,
            },
        });
        this.notify("initialized", {});
    }

    async request(method: string, params: unknown): Promise<unknown> {
        const id = this.nextId++;

        return await new Promise<unknown>((resolve, reject) => {
            this.pending.set(id, { resolve, reject });
            this.child.stdin.write(
                toJsonLine({
                    id,
                    method,
                    params,
                }),
            );
        });
    }

    notify(method: string, params: unknown): void {
        this.child.stdin.write(
            toJsonLine({
                method,
                params,
            }),
        );
    }

    stop(): void {
        this.isStopping = true;
        this.child.kill("SIGTERM");
    }
}

export class CodexRuntimeManager {
    private readonly runtimes = new Map<string, ConversationRuntime>();
    private readonly getConfig: () => AgentchatConfig;
    private readonly persistence: RuntimePersistenceClient;
    private readonly createClient: CreateCodexClient;

    constructor(params: {
        getConfig: () => AgentchatConfig;
        persistence: RuntimePersistenceClient;
        createClient?: CreateCodexClient;
    }) {
        this.getConfig = params.getConfig;
        this.persistence = params.persistence;
        this.createClient =
            params.createClient ??
            ((clientParams) => new CodexAppServerClient(clientParams));
    }

    async sendMessage(params: {
        userSub: string;
        userId: string;
        command: ConversationSendCommand;
        sendEvent: (event: ServerEvent) => void;
    }): Promise<void> {
        const { runtime, isNew } = await this.ensureRuntime(params);
        if (runtime.activeTurn) {
            throw new Error("Conversation already has an active run.");
        }

        if (runtime.idleTimer) {
            clearTimeout(runtime.idleTimer);
            runtime.idleTimer = null;
        }

        const runId = crypto.randomUUID();
        params.sendEvent(
            createServerEvent("run.started", {
                conversationId: params.command.payload.conversationId,
                runId,
                messageId: params.command.payload.assistantMessageId,
            }),
        );

        await new Promise<void>(async (resolve, reject) => {
            runtime.activeTurn = {
                runId,
                userId: params.userId,
                triggerMessageId: params.command.payload.userMessageId,
                assistantMessageId: params.command.payload.assistantMessageId,
                turnId: null,
                text: "",
                nextSequence: 2,
                lastPersistedContent: "",
                pendingDeltaFlush: null,
                sendEvent: params.sendEvent,
                resolve,
                reject,
            };

            try {
                const startedAt = Date.now();
                await this.persistence.runtimeBinding({
                    userId: params.userId,
                    conversationLocalId: params.command.payload.conversationId,
                    provider: runtime.provider.id,
                    status: "active",
                    providerThreadId: runtime.threadId,
                    providerResumeToken: null,
                    activeRunId: null,
                    lastError: null,
                    lastEventAt: startedAt,
                    expiresAt: null,
                    updatedAt: startedAt,
                });

                const inputText = isNew
                    ? buildInitialTurnText(
                          params.command.payload.history,
                          params.command.payload.content,
                      )
                    : params.command.payload.content;

                const turnResult = await runtime.client.request("turn/start", {
                    threadId: runtime.threadId,
                    input: [{ type: "text", text: inputText }],
                    cwd: runtime.agent.rootPath,
                    approvalPolicy: "never",
                    sandboxPolicy: {
                        type: "dangerFullAccess",
                    },
                    model: params.command.payload.modelId,
                    effort: params.command.payload.thinking,
                    personality: "pragmatic",
                });

                runtime.activeTurn.turnId = extractTurnId(turnResult);
                runtime.modelId = params.command.payload.modelId;

                await this.persistence.runStarted({
                    userId: params.userId,
                    conversationLocalId: params.command.payload.conversationId,
                    triggerMessageLocalId: params.command.payload.userMessageId,
                    assistantMessageLocalId:
                        params.command.payload.assistantMessageId,
                    externalRunId: runId,
                    provider: runtime.provider.id,
                    providerThreadId: runtime.threadId,
                    providerTurnId: runtime.activeTurn.turnId,
                    startedAt,
                });
            } catch (error) {
                if (runtime.activeTurn?.turnId) {
                    try {
                        await runtime.client.request("turn/interrupt", {
                            threadId: runtime.threadId,
                            turnId: runtime.activeTurn.turnId,
                        });
                    } catch (interruptError) {
                        console.error(
                            "[agentchat-server] failed to interrupt turn after send failure",
                            interruptError,
                        );
                    }
                }
                if (runtime.activeTurn?.pendingDeltaFlush) {
                    clearTimeout(runtime.activeTurn.pendingDeltaFlush);
                }
                runtime.activeTurn = null;
                params.sendEvent(
                    createServerEvent("run.failed", {
                        conversationId: params.command.payload.conversationId,
                        runId,
                        error: {
                            message:
                                error instanceof Error
                                    ? error.message
                                    : "Failed to start Codex turn",
                        },
                    }),
                );
                reject(
                    error instanceof Error
                        ? error
                        : new Error("Failed to start Codex turn"),
                );
            }
        }).catch(() => undefined);
    }

    async interrupt(params: {
        userSub: string;
        conversationId: string;
    }): Promise<void> {
        const runtime = this.runtimes.get(
            getRuntimeKey(params.userSub, params.conversationId),
        );
        if (!runtime?.activeTurn?.turnId) {
            return;
        }

        await runtime.client.request("turn/interrupt", {
            threadId: runtime.threadId,
            turnId: runtime.activeTurn.turnId,
        });
    }

    private async ensureRuntime(params: {
        userSub: string;
        userId: string;
        command: ConversationSendCommand;
        sendEvent: (event: ServerEvent) => void;
    }): Promise<{ runtime: ConversationRuntime; isNew: boolean }> {
        const config = this.getConfig();
        const resources = resolveRuntimeResources(config, params.command);
        const key = getRuntimeKey(
            params.userSub,
            params.command.payload.conversationId,
        );
        const existing = this.runtimes.get(key);
        if (existing) {
            if (shouldRecycleRuntime(existing, resources)) {
                existing.client.stop();
                this.runtimes.delete(key);
            } else {
                existing.agent = resources.agent;
                existing.provider = resources.provider;
                existing.userId = params.userId;
                return { runtime: existing, isNew: false };
            }
        }

        const client = this.createClient({
            provider: resources.provider,
            agent: resources.agent,
        });
        await client.initialize();
        const persistedBinding = await this.persistence.readRuntimeBinding({
            userId: params.userId,
            conversationLocalId: params.command.payload.conversationId,
        });
        const { threadId, isNew } = await this.openThread({
            client,
            resources,
            binding: persistedBinding,
            modelId: params.command.payload.modelId,
        });

        const runtime: ConversationRuntime = {
            key,
            userSub: params.userSub,
            userId: params.userId,
            conversationId: params.command.payload.conversationId,
            agentId: resources.agent.id,
            modelId: params.command.payload.modelId,
            provider: resources.provider,
            agent: resources.agent,
            client,
            threadId,
            activeTurn: null,
            idleTimer: null,
        };

        client.onNotification((notification) => {
            this.handleNotification(runtime, notification);
        });
        client.onExit((error) => {
            this.handleRuntimeExit(runtime, error);
        });

        this.runtimes.set(key, runtime);
        return { runtime, isNew };
    }

    private async openThread(params: {
        client: CodexClient;
        resources: ResolvedRuntimeResources;
        binding: PersistedRuntimeBinding | null;
        modelId: string;
    }): Promise<{ threadId: string; isNew: boolean }> {
        const threadOpenParams = {
            model: params.modelId,
            cwd: params.resources.agent.rootPath,
            approvalPolicy: "never",
            sandbox: "danger-full-access",
            personality: "pragmatic",
            experimentalRawEvents: false,
            persistExtendedHistory: true,
        };

        const persistedThreadId =
            params.binding?.provider === params.resources.provider.id
                ? params.binding.providerThreadId
                : null;

        if (persistedThreadId) {
            try {
                const threadResult = await params.client.request(
                    "thread/resume",
                    {
                        ...threadOpenParams,
                        threadId: persistedThreadId,
                    },
                );
                return {
                    threadId: extractThreadId(threadResult),
                    isNew: false,
                };
            } catch (error) {
                if (!isRecoverableThreadResumeError(error)) {
                    params.client.stop();
                    throw error;
                }
            }
        }

        const threadResult = await params.client.request(
            "thread/start",
            threadOpenParams,
        );
        return {
            threadId: extractThreadId(threadResult),
            isNew: true,
        };
    }

    private handleRuntimeExit(
        runtime: ConversationRuntime,
        error: Error,
    ): void {
        if (runtime.idleTimer) {
            clearTimeout(runtime.idleTimer);
            runtime.idleTimer = null;
        }

        if (runtime.activeTurn) {
            const activeTurn = runtime.activeTurn;
            if (activeTurn.pendingDeltaFlush) {
                clearTimeout(activeTurn.pendingDeltaFlush);
            }
            if (activeTurn.text) {
                activeTurn.sendEvent(
                    createServerEvent("message.completed", {
                        conversationId: runtime.conversationId,
                        messageId: activeTurn.assistantMessageId,
                        content: activeTurn.text,
                    }),
                );
            }

            const sequence = activeTurn.nextSequence;
            activeTurn.nextSequence += 2;
            void this.persistence
                .runFailed({
                    userId: activeTurn.userId,
                    conversationLocalId: runtime.conversationId,
                    assistantMessageLocalId: activeTurn.assistantMessageId,
                    externalRunId: activeTurn.runId,
                    sequence,
                    content: activeTurn.text,
                    completedAt: Date.now(),
                    errorMessage: error.message,
                })
                .catch((persistError) => {
                    console.error(
                        "[agentchat-server] failed to persist crashed run",
                        persistError,
                    );
                });

            activeTurn.sendEvent(
                createServerEvent("run.failed", {
                    conversationId: runtime.conversationId,
                    runId: activeTurn.runId,
                    error: {
                        message: error.message,
                    },
                }),
            );
            runtime.activeTurn = null;
            activeTurn.reject(error);
        }

        void this.persistence
            .runtimeBinding({
                userId: runtime.userId,
                conversationLocalId: runtime.conversationId,
                provider: runtime.provider.id,
                status: "errored",
                providerThreadId: runtime.threadId,
                providerResumeToken: null,
                activeRunId: null,
                lastError: error.message,
                lastEventAt: Date.now(),
                expiresAt: null,
                updatedAt: Date.now(),
            })
            .catch((persistError) => {
                console.error(
                    "[agentchat-server] failed to persist errored runtime binding",
                    persistError,
                );
            });

        this.runtimes.delete(runtime.key);
    }

    private handleNotification(
        runtime: ConversationRuntime,
        notification: JsonRpcNotification,
    ): void {
        const activeTurn = runtime.activeTurn;
        if (!activeTurn || typeof notification.method !== "string") {
            return;
        }

        if (notification.method === "item/agentMessage/delta") {
            const delta = notification.params?.delta;
            if (typeof delta !== "string") {
                return;
            }

            activeTurn.text += delta;
            activeTurn.sendEvent(
                createServerEvent("message.delta", {
                    conversationId: runtime.conversationId,
                    messageId: activeTurn.assistantMessageId,
                    delta,
                    content: activeTurn.text,
                }),
            );
            this.scheduleMessageDeltaPersistence(runtime, activeTurn);
            return;
        }

        if (notification.method !== "turn/completed") {
            return;
        }

        const turn = notification.params?.turn as
            | { status?: unknown; error?: { message?: unknown } }
            | undefined;
        const status = turn?.status;
        const errorMessage =
            typeof turn?.error?.message === "string"
                ? turn.error.message
                : "Codex run failed";

        activeTurn.sendEvent(
            createServerEvent("message.completed", {
                conversationId: runtime.conversationId,
                messageId: activeTurn.assistantMessageId,
                content: activeTurn.text,
            }),
        );

        this.cancelPendingMessageDelta(activeTurn);

        if (status === "completed") {
            const sequence = activeTurn.nextSequence;
            activeTurn.nextSequence += 2;
            void this.persistence
                .runCompleted({
                    userId: activeTurn.userId,
                    conversationLocalId: runtime.conversationId,
                    assistantMessageLocalId: activeTurn.assistantMessageId,
                    externalRunId: activeTurn.runId,
                    sequence,
                    content: activeTurn.text,
                    completedAt: Date.now(),
                })
                .catch((error) => {
                    console.error(
                        "[agentchat-server] failed to persist run completion",
                        error,
                    );
                });
            activeTurn.sendEvent(
                createServerEvent("run.completed", {
                    conversationId: runtime.conversationId,
                    runId: activeTurn.runId,
                }),
            );
            runtime.activeTurn = null;
            this.scheduleIdleExpiration(runtime);
            activeTurn.resolve();
            return;
        }

        if (status === "interrupted") {
            const sequence = activeTurn.nextSequence;
            activeTurn.nextSequence += 2;
            void this.persistence
                .runInterrupted({
                    userId: activeTurn.userId,
                    conversationLocalId: runtime.conversationId,
                    assistantMessageLocalId: activeTurn.assistantMessageId,
                    externalRunId: activeTurn.runId,
                    sequence,
                    content: activeTurn.text,
                    completedAt: Date.now(),
                })
                .catch((error) => {
                    console.error(
                        "[agentchat-server] failed to persist interrupted run",
                        error,
                    );
                });
            activeTurn.sendEvent(
                createServerEvent("run.interrupted", {
                    conversationId: runtime.conversationId,
                    runId: activeTurn.runId,
                }),
            );
            runtime.activeTurn = null;
            this.scheduleIdleExpiration(runtime);
            activeTurn.resolve();
            return;
        }

        const sequence = activeTurn.nextSequence;
        activeTurn.nextSequence += 2;
        void this.persistence
            .runFailed({
                userId: activeTurn.userId,
                conversationLocalId: runtime.conversationId,
                assistantMessageLocalId: activeTurn.assistantMessageId,
                externalRunId: activeTurn.runId,
                sequence,
                content: activeTurn.text,
                completedAt: Date.now(),
                errorMessage,
            })
            .catch((error) => {
                console.error(
                    "[agentchat-server] failed to persist failed run",
                    error,
                );
            });
        activeTurn.sendEvent(
            createServerEvent("run.failed", {
                conversationId: runtime.conversationId,
                runId: activeTurn.runId,
                error: {
                    message: errorMessage,
                },
            }),
        );
        runtime.activeTurn = null;
        this.scheduleIdleExpiration(runtime);
        activeTurn.reject(new Error(errorMessage));
    }

    private scheduleIdleExpiration(runtime: ConversationRuntime): void {
        if (runtime.idleTimer) {
            clearTimeout(runtime.idleTimer);
        }

        runtime.idleTimer = setTimeout(() => {
            void this.persistence
                .runtimeBinding({
                    userId: runtime.userId,
                    conversationLocalId: runtime.conversationId,
                    provider: runtime.provider.id,
                    status: "expired",
                    providerThreadId: runtime.threadId,
                    providerResumeToken: null,
                    activeRunId: null,
                    lastError: null,
                    lastEventAt: Date.now(),
                    expiresAt: Date.now(),
                    updatedAt: Date.now(),
                })
                .catch((error) => {
                    console.error(
                        "[agentchat-server] failed to persist expired runtime binding",
                        error,
                    );
                });
            runtime.client.stop();
            this.runtimes.delete(runtime.key);
        }, runtime.provider.idleTtlSeconds * 1000);
    }

    private scheduleMessageDeltaPersistence(
        runtime: ConversationRuntime,
        activeTurn: ActiveTurn,
    ): void {
        if (activeTurn.pendingDeltaFlush) {
            return;
        }

        activeTurn.pendingDeltaFlush = setTimeout(() => {
            activeTurn.pendingDeltaFlush = null;
            void this.flushMessageDelta(runtime, activeTurn).catch((error) => {
                console.error(
                    "[agentchat-server] failed to persist message delta",
                    error,
                );
            });
        }, 250);
    }

    private cancelPendingMessageDelta(activeTurn: ActiveTurn): void {
        if (activeTurn.pendingDeltaFlush) {
            clearTimeout(activeTurn.pendingDeltaFlush);
            activeTurn.pendingDeltaFlush = null;
        }
    }

    private async flushMessageDelta(
        runtime: ConversationRuntime,
        activeTurn: ActiveTurn,
    ): Promise<void> {
        if (activeTurn.text === activeTurn.lastPersistedContent) {
            return;
        }

        const delta = activeTurn.text.slice(
            activeTurn.lastPersistedContent.length,
        );
        activeTurn.lastPersistedContent = activeTurn.text;

        await this.persistence.messageDelta({
            userId: activeTurn.userId,
            conversationLocalId: runtime.conversationId,
            assistantMessageLocalId: activeTurn.assistantMessageId,
            externalRunId: activeTurn.runId,
            sequence: activeTurn.nextSequence++,
            content: activeTurn.text,
            delta,
            createdAt: Date.now(),
        });
    }
}

function resolveRuntimeResources(
    config: AgentchatConfig,
    command: ConversationSendCommand,
): ResolvedRuntimeResources {
    const agent =
        config.agents.find(
            (candidate) =>
                candidate.id === command.payload.agentId && candidate.enabled,
        ) ?? null;
    invariant(agent, "Agent is not available.");

    const provider =
        config.providers.find(
            (candidate) =>
                candidate.id === agent.defaultProviderId && candidate.enabled,
        ) ?? null;
    invariant(provider, "Provider is not available.");

    const model =
        provider.models.find(
            (candidate) =>
                candidate.id === command.payload.modelId && candidate.enabled,
        ) ?? null;
    invariant(model, "Model is not available.");

    if (
        agent.modelAllowlist.length > 0 &&
        !agent.modelAllowlist.includes(command.payload.modelId)
    ) {
        throw new Error("Model is not allowed for this agent.");
    }

    return { agent, provider };
}

function shouldRecycleRuntime(
    runtime: ConversationRuntime,
    resources: ResolvedRuntimeResources,
): boolean {
    if (runtime.agent.id !== resources.agent.id) {
        return true;
    }

    if (runtime.agent.rootPath !== resources.agent.rootPath) {
        return true;
    }

    if (runtime.provider.id !== resources.provider.id) {
        return true;
    }

    return (
        runtime.provider.codex.command !== resources.provider.codex.command ||
        JSON.stringify(runtime.provider.codex.args) !==
            JSON.stringify(resources.provider.codex.args) ||
        JSON.stringify(runtime.provider.codex.baseEnv) !==
            JSON.stringify(resources.provider.codex.baseEnv) ||
        runtime.provider.codex.cwd !== resources.provider.codex.cwd
    );
}
