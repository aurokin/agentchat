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
import type { WorkspaceManager } from "./workspaceManager.ts";

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
    inFlightDeltaFlush: Promise<void> | null;
    pendingMessageStartPersistence: Promise<void> | null;
    reject: (error: Error) => void;
    resolve: () => void;
};

type ConversationRuntime = {
    key: string;
    userId: string;
    conversationId: string;
    agentId: string;
    modelId: string;
    provider: ProviderConfig;
    agent: AgentConfig;
    cwd: string;
    client: CodexClient;
    threadId: string;
    activeTurn: ActiveTurn | null;
    idleTimer: ReturnType<typeof setTimeout> | null;
    subscribers: Map<string, RuntimeSubscriber>;
};

type RuntimeSubscriber = {
    sendEvent: (event: ServerEvent) => void;
    subscriptionCount: number;
    retainDuringActiveTurn: boolean;
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

function getRuntimeKey(userId: string, conversationId: string): string {
    return `${userId}:${conversationId}`;
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

function getCodexEventMessage(
    params: Record<string, unknown> | undefined,
): Record<string, unknown> | null {
    const message = params?.msg;
    return message && typeof message === "object"
        ? (message as Record<string, unknown>)
        : null;
}

function getAgentReasoningText(
    params: Record<string, unknown> | undefined,
): string | null {
    const message = getCodexEventMessage(params);
    const text =
        typeof message?.text === "string"
            ? message.text
            : typeof params?.text === "string"
              ? params.text
              : null;
    return text?.trim() ? text.trim() : null;
}

export class CodexRuntimeManager {
    private readonly runtimes = new Map<string, ConversationRuntime>();
    private readonly pendingSubscriptions = new Map<
        string,
        Map<string, RuntimeSubscriber>
    >();
    private readonly getConfig: () => AgentchatConfig;
    private readonly persistence: RuntimePersistenceClient;
    private readonly createClient: CreateCodexClient;
    private readonly workspaceManager: WorkspaceManager | null;

    constructor(params: {
        getConfig: () => AgentchatConfig;
        persistence: RuntimePersistenceClient;
        createClient?: CreateCodexClient;
        workspaceManager?: WorkspaceManager;
    }) {
        this.getConfig = params.getConfig;
        this.persistence = params.persistence;
        this.createClient =
            params.createClient ??
            ((clientParams) => new CodexAppServerClient(clientParams));
        this.workspaceManager = params.workspaceManager ?? null;
    }

    async sendMessage(params: {
        userId: string;
        subscriberId: string;
        command: ConversationSendCommand;
        sendEvent: (event: ServerEvent) => void;
    }): Promise<void> {
        const { runtime, isNew } = await this.ensureRuntime(params);
        this.retainSubscriberForActiveTurn(
            runtime,
            params.subscriberId,
            params.sendEvent,
        );
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

        await new Promise<void>((resolve, reject) => {
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
                inFlightDeltaFlush: null,
                pendingMessageStartPersistence: null,
                reject,
                resolve,
            };

            void (async () => {
                try {
                    const activeTurn = runtime.activeTurn;
                    if (!activeTurn) {
                        reject(
                            new Error(
                                "Active turn was cleared before Codex turn start.",
                            ),
                        );
                        return;
                    }

                    const startedAt = Date.now();
                    await this.persistence.runtimeBinding({
                        userId: params.userId,
                        conversationLocalId:
                            params.command.payload.conversationId,
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

                    const turnResult = await runtime.client.request(
                        "turn/start",
                        {
                            threadId: runtime.threadId,
                            input: [{ type: "text", text: inputText }],
                            cwd: runtime.cwd,
                            approvalPolicy: "never",
                            sandboxPolicy: {
                                type: "dangerFullAccess",
                            },
                            model: params.command.payload.modelId,
                            effort: resolveCodexEffort(params.command),
                            personality: "pragmatic",
                        },
                    );

                    activeTurn.turnId = extractTurnId(turnResult);
                    runtime.modelId = params.command.payload.modelId;

                    await this.persistence.runStarted({
                        userId: params.userId,
                        conversationLocalId:
                            params.command.payload.conversationId,
                        triggerMessageLocalId:
                            params.command.payload.userMessageId,
                        assistantMessageLocalId:
                            params.command.payload.assistantMessageId,
                        externalRunId: runId,
                        provider: runtime.provider.id,
                        providerThreadId: runtime.threadId,
                        providerTurnId: activeTurn.turnId,
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
                            conversationId:
                                params.command.payload.conversationId,
                            runId,
                            error: {
                                message: errorMessage,
                            },
                        }),
                    );
                    reject(
                        error instanceof Error
                            ? error
                            : new Error(errorMessage),
                    );
                }
            })();
        }).catch(() => undefined);
    }

    async interrupt(params: {
        userId: string;
        conversationId: string;
    }): Promise<void> {
        const runtime = this.runtimes.get(
            getRuntimeKey(params.userId, params.conversationId),
        );
        if (!runtime?.activeTurn?.turnId) {
            return;
        }

        await runtime.client.request("turn/interrupt", {
            threadId: runtime.threadId,
            turnId: runtime.activeTurn.turnId,
        });
    }

    deleteConversationWorkspace(params: {
        userId: string;
        conversationId: string;
        agentId: string;
    }): void {
        const config = this.getConfig();
        const agent = config.agents.find(
            (a) => a.id === params.agentId && a.enabled,
        );
        if (!agent) {
            console.warn(
                `[agentchat-server] conversation.delete: unknown or disabled agent '${params.agentId}'; ignoring`,
            );
            return;
        }

        // If there's a live runtime, verify the agentId matches before tearing down
        const key = getRuntimeKey(params.userId, params.conversationId);
        const runtime = this.runtimes.get(key);
        if (runtime && runtime.agentId !== params.agentId) {
            console.warn(
                `[agentchat-server] conversation.delete: agentId mismatch (runtime=${runtime.agentId}, request=${params.agentId}); ignoring`,
            );
            return;
        }

        // Tear down any active runtime for this conversation
        if (runtime) {
            if (runtime.idleTimer) {
                clearTimeout(runtime.idleTimer);
            }
            runtime.client.stop();
            this.runtimes.delete(key);
        }
        this.pendingSubscriptions.delete(key);

        // Delete the sandbox workspace if workspace manager is configured
        this.workspaceManager?.deleteWorkspace(
            params.agentId,
            params.userId,
            params.conversationId,
        );
    }

    subscribe(params: {
        userId: string;
        conversationId: string;
        subscriberId: string;
        sendEvent: (event: ServerEvent) => void;
    }): Promise<void> | void {
        const key = getRuntimeKey(params.userId, params.conversationId);
        const runtime = this.runtimes.get(key);
        if (!runtime) {
            this.addPendingSubscription(
                key,
                params.subscriberId,
                params.sendEvent,
            );
            return this.recoverOrphanedActiveRun({
                userId: params.userId,
                conversationId: params.conversationId,
            });
        }

        this.addConversationSubscription(
            runtime,
            params.subscriberId,
            params.sendEvent,
        );
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

    /**
     * Returns the set of conversationIds for all live runtimes.
     */
    getActiveConversationIds(): Set<string> {
        const ids = new Set<string>();
        for (const runtime of this.runtimes.values()) {
            ids.add(runtime.conversationId);
        }
        return ids;
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
            if (!params.conversationId) {
                runtime.subscribers.delete(params.subscriberId);
                continue;
            }

            const subscriber = runtime.subscribers.get(params.subscriberId);
            if (!subscriber) {
                continue;
            }

            subscriber.subscriptionCount = Math.max(
                0,
                subscriber.subscriptionCount - 1,
            );
            this.cleanupSubscriber(runtime, params.subscriberId);
        }

        for (const [key, subscribers] of this.pendingSubscriptions) {
            if (
                params.conversationId &&
                !key.endsWith(`:${params.conversationId}`)
            ) {
                continue;
            }

            const subscriber = subscribers.get(params.subscriberId);
            if (!subscriber) {
                continue;
            }

            subscriber.subscriptionCount = Math.max(
                0,
                subscriber.subscriptionCount - 1,
            );
            this.cleanupSubscriberMap(subscribers, params.subscriberId);
            if (subscribers.size === 0) {
                this.pendingSubscriptions.delete(key);
            }
        }
    }

    private async ensureRuntime(params: {
        userId: string;
        command: ConversationSendCommand;
        sendEvent: (event: ServerEvent) => void;
    }): Promise<{ runtime: ConversationRuntime; isNew: boolean }> {
        const config = this.getConfig();
        const resources = resolveRuntimeResources(config, params.command);
        const key = getRuntimeKey(
            params.userId,
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

        const cwd = this.workspaceManager
            ? this.workspaceManager.ensureWorkspace(
                  resources.agent,
                  params.userId,
                  params.command.payload.conversationId,
              )
            : resources.agent.rootPath;

        const client = this.createClient({
            provider: resources.provider,
            agent: { ...resources.agent, rootPath: cwd },
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
            cwd,
        });

        const runtime: ConversationRuntime = {
            key,
            userId: params.userId,
            conversationId: params.command.payload.conversationId,
            agentId: resources.agent.id,
            modelId: params.command.payload.modelId,
            provider: resources.provider,
            agent: resources.agent,
            cwd,
            client,
            threadId,
            activeTurn: null,
            idleTimer: null,
            subscribers: new Map(),
        };

        const pendingSubscribers = this.pendingSubscriptions.get(key);
        if (pendingSubscribers) {
            runtime.subscribers = new Map(pendingSubscribers);
            this.pendingSubscriptions.delete(key);
        }

        client.onNotification((notification) => {
            this.handleNotification(runtime, notification);
        });
        client.onExit((error) => {
            this.handleRuntimeExit(runtime, error);
        });

        this.runtimes.set(key, runtime);
        return { runtime, isNew };
    }

    private addConversationSubscription(
        runtime: ConversationRuntime,
        subscriberId: string,
        sendEvent: (event: ServerEvent) => void,
    ): void {
        this.addSubscriber(runtime.subscribers, subscriberId, sendEvent);
    }

    private retainSubscriberForActiveTurn(
        runtime: ConversationRuntime,
        subscriberId: string,
        sendEvent: (event: ServerEvent) => void,
    ): void {
        const existing = runtime.subscribers.get(subscriberId);
        runtime.subscribers.set(subscriberId, {
            sendEvent,
            subscriptionCount: existing?.subscriptionCount ?? 0,
            retainDuringActiveTurn: true,
        });
    }

    private addPendingSubscription(
        runtimeKey: string,
        subscriberId: string,
        sendEvent: (event: ServerEvent) => void,
    ): void {
        const subscribers =
            this.pendingSubscriptions.get(runtimeKey) ?? new Map();
        this.addSubscriber(subscribers, subscriberId, sendEvent);
        this.pendingSubscriptions.set(runtimeKey, subscribers);
    }

    private addSubscriber(
        subscribers: Map<string, RuntimeSubscriber>,
        subscriberId: string,
        sendEvent: (event: ServerEvent) => void,
    ): void {
        const existing = subscribers.get(subscriberId);
        subscribers.set(subscriberId, {
            sendEvent,
            subscriptionCount: (existing?.subscriptionCount ?? 0) + 1,
            retainDuringActiveTurn: existing?.retainDuringActiveTurn ?? false,
        });
    }

    private releaseActiveTurnSubscribers(runtime: ConversationRuntime): void {
        for (const [subscriberId, subscriber] of runtime.subscribers) {
            subscriber.retainDuringActiveTurn = false;
            this.cleanupSubscriber(runtime, subscriberId);
        }
    }

    private cleanupSubscriber(
        runtime: ConversationRuntime,
        subscriberId: string,
    ): void {
        const subscriber = runtime.subscribers.get(subscriberId);
        if (!subscriber) {
            return;
        }

        if (
            subscriber.subscriptionCount === 0 &&
            !subscriber.retainDuringActiveTurn
        ) {
            runtime.subscribers.delete(subscriberId);
        }
    }

    private cleanupSubscriberMap(
        subscribers: Map<string, RuntimeSubscriber>,
        subscriberId: string,
    ): void {
        const subscriber = subscribers.get(subscriberId);
        if (!subscriber) {
            return;
        }

        if (
            subscriber.subscriptionCount === 0 &&
            !subscriber.retainDuringActiveTurn
        ) {
            subscribers.delete(subscriberId);
        }
    }

    private async recoverOrphanedActiveRun(params: {
        userId: string;
        conversationId: string;
    }): Promise<void> {
        const persistedBinding = await this.persistence.readRuntimeBinding({
            userId: params.userId,
            conversationLocalId: params.conversationId,
        });
        if (
            !persistedBinding ||
            persistedBinding.status !== "active" ||
            !persistedBinding.activeRunId
        ) {
            return;
        }

        await this.persistence.recoverStaleRun({
            userId: params.userId,
            conversationLocalId: params.conversationId,
            externalRunId: persistedBinding.activeRunId,
            completedAt: Date.now(),
            errorMessage:
                "This run was orphaned after the runtime disconnected before completion.",
        });
    }

    private emitToSubscribers(
        runtime: ConversationRuntime,
        event: ServerEvent,
    ): void {
        for (const subscriber of runtime.subscribers.values()) {
            subscriber.sendEvent(event);
        }
    }

    private async openThread(params: {
        client: CodexClient;
        resources: ResolvedRuntimeResources;
        binding: PersistedRuntimeBinding | null;
        modelId: string;
        cwd?: string;
    }): Promise<{ threadId: string; isNew: boolean }> {
        const threadOpenParams = {
            model: params.modelId,
            cwd: params.cwd ?? params.resources.agent.rootPath,
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

        if (notification.method === "codex/event/agent_reasoning") {
            const description = getAgentReasoningText(notification.params);
            if (!description) {
                return;
            }

            if (activeTurn.currentMessageIndex !== 0) {
                return;
            }

            const isFirstStatusChunk =
                activeTurn.currentMessageKind === "assistant_message" &&
                activeTurn.text.length === 0;
            if (
                !isFirstStatusChunk &&
                activeTurn.currentMessageKind !== "assistant_status"
            ) {
                return;
            }

            const delta = isFirstStatusChunk ? description : `\n${description}`;

            if (isFirstStatusChunk) {
                activeTurn.currentMessageKind = "assistant_status";

                this.emitToSubscribers(
                    runtime,
                    createServerEvent("message.started", {
                        conversationId: runtime.conversationId,
                        runId: activeTurn.runId,
                        messageId: activeTurn.currentMessageId,
                        messageIndex: activeTurn.currentMessageIndex,
                        kind: activeTurn.currentMessageKind,
                        content: description,
                    }),
                );
            } else {
                activeTurn.text += delta;
                activeTurn.lastPersistedContent = activeTurn.text;
                this.emitToSubscribers(
                    runtime,
                    createServerEvent("message.delta", {
                        conversationId: runtime.conversationId,
                        messageId: activeTurn.currentMessageId,
                        delta,
                        content: activeTurn.text,
                    }),
                );
            }

            if (isFirstStatusChunk) {
                activeTurn.text = description;
                activeTurn.lastPersistedContent = description;
            }

            void this.persistence
                .messageDelta({
                    userId: activeTurn.userId,
                    conversationLocalId: runtime.conversationId,
                    assistantMessageLocalId: activeTurn.currentMessageId,
                    externalRunId: activeTurn.runId,
                    sequence: activeTurn.nextSequence++,
                    content: activeTurn.text,
                    delta,
                    kind: activeTurn.currentMessageKind,
                    runMessageIndex: activeTurn.currentMessageIndex,
                    createdAt: Date.now(),
                })
                .catch((error) => {
                    console.error(
                        "[agentchat-server] failed to persist agent reasoning status",
                        error,
                    );
                });
            return;
        }

        if (notification.method === "item/agentMessage/delta") {
            const delta = notification.params?.delta;
            if (typeof delta !== "string") {
                return;
            }

            if (activeTurn.currentMessageKind === "assistant_status") {
                this.transitionStatusMessageToAssistantOutput(
                    runtime,
                    activeTurn,
                );
            }

            activeTurn.text += delta;
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
            void this.finalizeTurn(runtime, activeTurn, {
                finalStatus: "interrupted",
            });
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

        if (status === "completed") {
            void this.finalizeTurn(runtime, activeTurn, {
                finalStatus: "completed",
            });
            return;
        }

        if (status === "interrupted") {
            void this.finalizeTurn(runtime, activeTurn, {
                finalStatus: "interrupted",
            });
            return;
        }

        void this.finalizeTurn(runtime, activeTurn, {
            finalStatus: "errored",
            errorMessage,
        });
    }

    private transitionStatusMessageToAssistantOutput(
        runtime: ConversationRuntime,
        activeTurn: ActiveTurn,
    ): void {
        if (activeTurn.currentMessageKind !== "assistant_status") {
            return;
        }

        this.cancelPendingMessageDelta(activeTurn);

        const previousMessageId = activeTurn.currentMessageId;
        const previousContent = activeTurn.text;
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
        activeTurn.text = "";
        activeTurn.lastPersistedContent = "";

        this.emitToSubscribers(
            runtime,
            createServerEvent("message.started", {
                conversationId: runtime.conversationId,
                runId: activeTurn.runId,
                messageId: activeTurn.currentMessageId,
                messageIndex: activeTurn.currentMessageIndex,
                kind: activeTurn.currentMessageKind,
                content: "",
                previousMessageId,
                previousKind: "assistant_status",
            }),
        );

        const pendingMessageStartPersistence = this.persistence
            .messageStarted({
                userId: activeTurn.userId,
                conversationLocalId: runtime.conversationId,
                previousAssistantMessageLocalId: previousMessageId,
                previousCompletedSequence,
                previousKind: "assistant_status",
                assistantMessageLocalId: nextMessageId,
                messageStartedSequence,
                externalRunId: activeTurn.runId,
                kind: "assistant_message",
                runMessageIndex: activeTurn.currentMessageIndex,
                previousContent,
                content: "",
                createdAt,
            })
            .catch((error) => {
                console.error(
                    "[agentchat-server] failed to persist assistant output transition",
                    error,
                );
            })
            .finally(() => {
                if (
                    activeTurn.pendingMessageStartPersistence ===
                    pendingMessageStartPersistence
                ) {
                    activeTurn.pendingMessageStartPersistence = null;
                }
            });
        activeTurn.pendingMessageStartPersistence =
            pendingMessageStartPersistence;
    }

    private async finalizeTurn(
        runtime: ConversationRuntime,
        activeTurn: ActiveTurn,
        params:
            | {
                  finalStatus: "completed" | "interrupted";
              }
            | {
                  finalStatus: "errored";
                  errorMessage: string;
              },
    ): Promise<void> {
        this.emitToSubscribers(
            runtime,
            createServerEvent("message.completed", {
                conversationId: runtime.conversationId,
                messageId: activeTurn.currentMessageId,
                content: activeTurn.text,
            }),
        );

        this.cancelPendingMessageDelta(activeTurn);
        await activeTurn.inFlightDeltaFlush;
        await activeTurn.pendingMessageStartPersistence;

        const sequence = activeTurn.nextSequence;
        activeTurn.nextSequence += 2;
        const completedAt = Date.now();

        if (params.finalStatus === "completed") {
            void this.persistence
                .runCompleted({
                    userId: activeTurn.userId,
                    conversationLocalId: runtime.conversationId,
                    assistantMessageLocalId: activeTurn.currentMessageId,
                    externalRunId: activeTurn.runId,
                    sequence,
                    content: activeTurn.text,
                    completedAt,
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
            this.releaseActiveTurnSubscribers(runtime);
            this.scheduleIdleExpiration(runtime);
            activeTurn.resolve();
            return;
        }

        if (params.finalStatus === "interrupted") {
            void this.persistence
                .runInterrupted({
                    userId: activeTurn.userId,
                    conversationLocalId: runtime.conversationId,
                    assistantMessageLocalId: activeTurn.currentMessageId,
                    externalRunId: activeTurn.runId,
                    sequence,
                    content: activeTurn.text,
                    completedAt,
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
            this.releaseActiveTurnSubscribers(runtime);
            this.scheduleIdleExpiration(runtime);
            activeTurn.resolve();
            return;
        }

        invariant(
            params.finalStatus === "errored",
            "Expected errored final status for failed runtime finalization.",
        );
        const errorMessage = params.errorMessage;

        void this.persistence
            .runFailed({
                userId: activeTurn.userId,
                conversationLocalId: runtime.conversationId,
                assistantMessageLocalId: activeTurn.currentMessageId,
                externalRunId: activeTurn.runId,
                sequence,
                content: activeTurn.text,
                completedAt,
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
        this.releaseActiveTurnSubscribers(runtime);
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
            const flushPromise = this.flushMessageDelta(
                runtime,
                activeTurn,
            ).catch((error) => {
                console.error(
                    "[agentchat-server] failed to persist message delta",
                    error,
                );
            });
            activeTurn.inFlightDeltaFlush = flushPromise;
            void flushPromise.finally(() => {
                if (activeTurn.inFlightDeltaFlush === flushPromise) {
                    activeTurn.inFlightDeltaFlush = null;
                }
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

    if (runtime.agent.workspaceMode !== resources.agent.workspaceMode) {
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
