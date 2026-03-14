import type { AgentchatConfig, AgentConfig, ProviderConfig } from "./config.ts";
import {
    CodexAppServerClient,
    type CodexClient,
    type CreateCodexClient,
    type JsonRpcNotification,
} from "./codexAppServerClient.ts";
import type {
    ConversationHistoryEntry,
    ConversationSendCommand,
    ServerEvent,
} from "./socketProtocol.ts";
import type {
    PersistedRuntimeBinding,
    RuntimePersistenceClient,
} from "./runtimePersistence.ts";

type ActiveTurn = {
    runId: string;
    userId: string;
    triggerMessageId: string;
    turnId: string | null;
    currentMessageId: string;
    currentMessageKind: "assistant_message" | "assistant_status";
    currentMessageIndex: number;
    text: string;
    nextSequence: number;
    lastPersistedContent: string;
    pendingDeltaFlush: ReturnType<typeof setTimeout> | null;
    hasSplitTranscript: boolean;
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
    subscribers: Map<string, (event: ServerEvent) => void>;
};

type ResolvedRuntimeResources = {
    agent: AgentConfig;
    provider: ProviderConfig;
};

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
    "no rollout found",
    "is closing",
];

function isRecoverablePersistenceMissingResource(error: unknown): boolean {
    const message =
        error instanceof Error ? error.message : String(error ?? "");
    return (
        message.includes("Conversation not found") ||
        message.includes("Assistant message not found")
    );
}

export function isRecoverableThreadResumeError(error: unknown): boolean {
    const message = (
        error instanceof Error ? error.message : String(error)
    ).toLowerCase();
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

function resolveCodexEffort(command: ConversationSendCommand): string {
    return command.payload.variantId ?? "medium";
}

const REPORT_HEADING_PATTERN =
    /\n{2,}(Report|Assessment|Structure|Summary|Findings?|Recommendations?|Notable details|What [^\n:]+)\n/i;

const STRUCTURED_LIST_PATTERN = /(?:\d+\.\s+|[-*]\s+)/g;

function findStructuredListBoundary(text: string): number | null {
    for (const match of text.matchAll(STRUCTURED_LIST_PATTERN)) {
        const index = match.index ?? -1;
        if (index <= 0) {
            continue;
        }

        const prefix = text.slice(0, index);
        const trimmedPrefix = trimTrailingMessageContent(prefix) ?? "";
        if (trimmedPrefix.length < 48) {
            continue;
        }

        const recentPrefix = prefix.slice(Math.max(0, prefix.length - 4));
        const hasParagraphBoundary =
            recentPrefix.includes("\n\n") ||
            /[.!?]\s*$/.test(prefix) ||
            /[.!?]$/.test(prefix);
        if (!hasParagraphBoundary) {
            continue;
        }

        return index;
    }

    return null;
}

function detectTranscriptSplitBoundary(text: string): number | null {
    if (text.length < 48) {
        return null;
    }

    const match = REPORT_HEADING_PATTERN.exec(text);
    if (!match || match.index <= 0) {
        return findStructuredListBoundary(text);
    }

    return match.index + (match[0].startsWith("\n\n") ? 2 : 0);
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
        subscriberId: string;
        command: ConversationSendCommand;
        sendEvent: (event: ServerEvent) => void;
    }): Promise<void> {
        const { runtime, isNew } = await this.ensureRuntime(params);
        this.attachSubscriber(runtime, params.subscriberId, params.sendEvent);
        if (runtime.activeTurn) {
            throw new Error("Conversation already has an active run.");
        }

        if (runtime.idleTimer) {
            clearTimeout(runtime.idleTimer);
            runtime.idleTimer = null;
        }

        const runId = crypto.randomUUID();
        this.emitToSubscribers(
            runtime,
            createServerEvent("run.started", {
                conversationId: params.command.payload.conversationId,
                runId,
                messageId: params.command.payload.assistantMessageId,
            }),
        );
        this.emitToSubscribers(
            runtime,
            createServerEvent("message.started", {
                conversationId: params.command.payload.conversationId,
                runId,
                messageId: params.command.payload.assistantMessageId,
                messageIndex: 0,
                kind: "assistant_message",
                content: "",
            }),
        );

        await new Promise<void>(async (resolve, reject) => {
            runtime.activeTurn = {
                runId,
                userId: params.userId,
                triggerMessageId: params.command.payload.userMessageId,
                turnId: null,
                currentMessageId: params.command.payload.assistantMessageId,
                currentMessageKind: "assistant_message",
                currentMessageIndex: 0,
                text: "",
                nextSequence: 3,
                lastPersistedContent: "",
                pendingDeltaFlush: null,
                hasSplitTranscript: false,
                reject,
                resolve,
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
                    effort: resolveCodexEffort(params.command),
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
                const errorMessage =
                    error instanceof Error
                        ? error.message
                        : "Failed to start Codex turn";
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
                const failedTurn = runtime.activeTurn;
                runtime.activeTurn = null;
                if (failedTurn) {
                    try {
                        await this.persistence.runFailed({
                            userId: failedTurn.userId,
                            conversationLocalId:
                                params.command.payload.conversationId,
                            assistantMessageLocalId:
                                failedTurn.currentMessageId,
                            externalRunId: failedTurn.runId,
                            sequence: failedTurn.nextSequence,
                            content: failedTurn.text,
                            completedAt: Date.now(),
                            errorMessage,
                        });
                    } catch (persistError) {
                        console.error(
                            "[agentchat-server] failed to persist send-start failure",
                            persistError,
                        );
                    }
                }
                void this.persistence
                    .runtimeBinding({
                        userId: params.userId,
                        conversationLocalId:
                            params.command.payload.conversationId,
                        provider: runtime.provider.id,
                        status: "errored",
                        providerThreadId: runtime.threadId,
                        providerResumeToken: null,
                        activeRunId: null,
                        lastError: errorMessage,
                        lastEventAt: Date.now(),
                        expiresAt: null,
                        updatedAt: Date.now(),
                    })
                    .catch((persistError) => {
                        if (
                            isRecoverablePersistenceMissingResource(
                                persistError,
                            )
                        ) {
                            return;
                        }
                        console.error(
                            "[agentchat-server] failed to persist send-start error binding",
                            persistError,
                        );
                    });
                runtime.client.stop();
                this.runtimes.delete(runtime.key);
                this.emitToSubscribers(
                    runtime,
                    createServerEvent("run.failed", {
                        conversationId: params.command.payload.conversationId,
                        runId,
                        error: {
                            message: errorMessage,
                        },
                    }),
                );
                reject(
                    error instanceof Error ? error : new Error(errorMessage),
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

    subscribe(params: {
        userSub: string;
        conversationId: string;
        subscriberId: string;
        sendEvent: (event: ServerEvent) => void;
    }): void {
        const runtime = this.runtimes.get(
            getRuntimeKey(params.userSub, params.conversationId),
        );
        if (!runtime) {
            return;
        }

        this.attachSubscriber(runtime, params.subscriberId, params.sendEvent);
        if (!runtime.activeTurn) {
            return;
        }

        params.sendEvent(
            createServerEvent("run.started", {
                conversationId: runtime.conversationId,
                runId: runtime.activeTurn.runId,
                messageId: runtime.activeTurn.currentMessageId,
            }),
        );
        params.sendEvent(
            createServerEvent("message.started", {
                conversationId: runtime.conversationId,
                runId: runtime.activeTurn.runId,
                messageId: runtime.activeTurn.currentMessageId,
                messageIndex: runtime.activeTurn.currentMessageIndex,
                kind: runtime.activeTurn.currentMessageKind,
                content: runtime.activeTurn.text,
            }),
        );

        if (runtime.activeTurn.text) {
            params.sendEvent(
                createServerEvent("message.delta", {
                    conversationId: runtime.conversationId,
                    messageId: runtime.activeTurn.currentMessageId,
                    delta: runtime.activeTurn.text,
                    content: runtime.activeTurn.text,
                }),
            );
        }
    }

    unsubscribe(params: {
        subscriberId: string;
        conversationId?: string;
    }): void {
        for (const runtime of this.runtimes.values()) {
            if (
                params.conversationId &&
                runtime.conversationId !== params.conversationId
            ) {
                continue;
            }
            runtime.subscribers.delete(params.subscriberId);
        }
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
            subscribers: new Map(),
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

    private attachSubscriber(
        runtime: ConversationRuntime,
        subscriberId: string,
        sendEvent: (event: ServerEvent) => void,
    ): void {
        runtime.subscribers.set(subscriberId, sendEvent);
    }

    private emitToSubscribers(
        runtime: ConversationRuntime,
        event: ServerEvent,
    ): void {
        for (const sendEvent of runtime.subscribers.values()) {
            sendEvent(event);
        }
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
                this.emitToSubscribers(
                    runtime,
                    createServerEvent("message.completed", {
                        conversationId: runtime.conversationId,
                        messageId: activeTurn.currentMessageId,
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
                    assistantMessageLocalId: activeTurn.currentMessageId,
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

            this.emitToSubscribers(
                runtime,
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
                if (isRecoverablePersistenceMissingResource(persistError)) {
                    return;
                }
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
            this.splitActiveTurnIfNeeded(runtime, activeTurn);
            this.emitToSubscribers(
                runtime,
                createServerEvent("message.delta", {
                    conversationId: runtime.conversationId,
                    messageId: activeTurn.currentMessageId,
                    delta,
                    content: activeTurn.text,
                }),
            );
            this.scheduleMessageDeltaPersistence(runtime, activeTurn);
            return;
        }

        if (notification.method === "turn/aborted") {
            this.emitToSubscribers(
                runtime,
                createServerEvent("message.completed", {
                    conversationId: runtime.conversationId,
                    messageId: activeTurn.currentMessageId,
                    content: activeTurn.text,
                }),
            );

            this.cancelPendingMessageDelta(activeTurn);

            const sequence = activeTurn.nextSequence;
            activeTurn.nextSequence += 2;
            void this.persistence
                .runInterrupted({
                    userId: activeTurn.userId,
                    conversationLocalId: runtime.conversationId,
                    assistantMessageLocalId: activeTurn.currentMessageId,
                    externalRunId: activeTurn.runId,
                    sequence,
                    content: activeTurn.text,
                    completedAt: Date.now(),
                })
                .catch((error) => {
                    console.error(
                        "[agentchat-server] failed to persist aborted run",
                        error,
                    );
                });
            this.emitToSubscribers(
                runtime,
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

        this.emitToSubscribers(
            runtime,
            createServerEvent("message.completed", {
                conversationId: runtime.conversationId,
                messageId: activeTurn.currentMessageId,
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
                    assistantMessageLocalId: activeTurn.currentMessageId,
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
            this.emitToSubscribers(
                runtime,
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
                    assistantMessageLocalId: activeTurn.currentMessageId,
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
            this.emitToSubscribers(
                runtime,
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
                assistantMessageLocalId: activeTurn.currentMessageId,
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
        this.emitToSubscribers(
            runtime,
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

    private splitActiveTurnIfNeeded(
        runtime: ConversationRuntime,
        activeTurn: ActiveTurn,
    ): void {
        if (activeTurn.hasSplitTranscript) {
            return;
        }

        const boundaryIndex = detectTranscriptSplitBoundary(activeTurn.text);
        if (boundaryIndex === null) {
            return;
        }

        const previousContent =
            trimTrailingMessageContent(
                activeTurn.text.slice(0, boundaryIndex),
            ) ?? "";
        const nextContent =
            trimLeadingMessageContent(activeTurn.text.slice(boundaryIndex)) ??
            "";

        if (!previousContent || !nextContent) {
            return;
        }

        this.cancelPendingMessageDelta(activeTurn);
        activeTurn.hasSplitTranscript = true;
        activeTurn.text = nextContent;
        activeTurn.lastPersistedContent = nextContent;

        const previousMessageId = activeTurn.currentMessageId;
        const nextMessageId = crypto.randomUUID();
        const previousCompletedSequence = activeTurn.nextSequence++;
        const messageStartedSequence = activeTurn.nextSequence++;
        const createdAt = Date.now();

        this.emitToSubscribers(
            runtime,
            createServerEvent("message.completed", {
                conversationId: runtime.conversationId,
                messageId: previousMessageId,
                content: previousContent,
            }),
        );

        activeTurn.currentMessageId = nextMessageId;
        activeTurn.currentMessageKind = "assistant_message";
        activeTurn.currentMessageIndex += 1;

        this.emitToSubscribers(
            runtime,
            createServerEvent("message.started", {
                conversationId: runtime.conversationId,
                runId: activeTurn.runId,
                messageId: activeTurn.currentMessageId,
                messageIndex: activeTurn.currentMessageIndex,
                kind: activeTurn.currentMessageKind,
                content: activeTurn.text,
            }),
        );

        void this.persistence
            .messageStarted({
                userId: activeTurn.userId,
                conversationLocalId: runtime.conversationId,
                previousAssistantMessageLocalId: previousMessageId,
                previousCompletedSequence,
                assistantMessageLocalId: nextMessageId,
                messageStartedSequence,
                externalRunId: activeTurn.runId,
                kind: "assistant_message",
                runMessageIndex: activeTurn.currentMessageIndex,
                previousContent,
                content: nextContent,
                createdAt,
            })
            .catch((error) => {
                console.error(
                    "[agentchat-server] failed to persist split output message",
                    error,
                );
            });
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
                    if (isRecoverablePersistenceMissingResource(error)) {
                        return;
                    }
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
            assistantMessageLocalId: activeTurn.currentMessageId,
            externalRunId: activeTurn.runId,
            sequence: activeTurn.nextSequence++,
            content: activeTurn.text,
            delta,
            createdAt: Date.now(),
        });
    }
}

function trimLeadingMessageContent(value: string): string | undefined {
    const trimmed = value.replace(/^\s+/, "");
    return trimmed.length > 0 ? trimmed : undefined;
}

function trimTrailingMessageContent(value: string): string | undefined {
    const trimmed = value.replace(/\s+$/, "");
    return trimmed.length > 0 ? trimmed : undefined;
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
