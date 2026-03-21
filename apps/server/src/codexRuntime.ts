import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { AgentchatConfig, AgentConfig, ProviderConfig } from "./config.ts";
import { canonicalizePathForComparison } from "./pathComparison.ts";
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
    PersistedConversationRuntimeState,
    PersistedRuntimeBinding,
    RuntimePersistenceClient,
} from "./runtimePersistence.ts";
import {
    getSandboxConversationPathSegment,
    getSandboxUserPathSegment,
} from "./sandboxPaths.ts";
import {
    getDefaultAgentchatStateBasePath,
    getServerStateScopeKey,
} from "./serverState.ts";
import type { WorkspaceManager } from "./workspaceManager.ts";
import { getWorkspaceActiveKeyFromSegments } from "./workspaceManager.ts";

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
    chatId: string;
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

type RuntimeWorkspaceIdentity = {
    workspaceMode: "shared" | "copy-on-conversation";
    workspaceRootPath: string;
    workspaceCwd: string;
};

type PendingRuntimeInitialization = {
    cancelReason: Error | null;
    client: CodexClient | null;
    promise: Promise<{ runtime: ConversationRuntime; isNew: boolean }>;
};

type LegacySharedRootHistoryEntry = {
    rootPath: string;
    changedAt: number;
};

type LegacySharedRootHistory = Record<string, LegacySharedRootHistoryEntry>;

const LEGACY_SHARED_ROOT_HISTORY_DIRECTORY_NAME = "legacy-shared-roots";
const PENDING_RUNTIME_DELETE_WAIT_MS = 1_000;

function invariant(condition: unknown, message: string): asserts condition {
    if (!condition) {
        throw new Error(message);
    }
}

function getLegacySharedRootHistoryPath(stateId: string): string {
    return path.join(
        getDefaultAgentchatStateBasePath(),
        LEGACY_SHARED_ROOT_HISTORY_DIRECTORY_NAME,
        `${getServerStateScopeKey(stateId)}.json`,
    );
}

function getRuntimeKey(
    userId: string,
    agentId: string,
    conversationId: string,
): string {
    return JSON.stringify([userId, agentId, conversationId]);
}

function runtimeKeyMatchesConversation(params: {
    runtimeKey: string;
    conversationId: string;
    agentId?: string;
}): boolean {
    let parsed: unknown;
    try {
        parsed = JSON.parse(params.runtimeKey);
    } catch {
        return false;
    }

    if (!Array.isArray(parsed) || parsed.length !== 3) {
        return false;
    }

    const [, keyAgentId, keyConversationId] = parsed;
    if (
        typeof keyAgentId !== "string" ||
        typeof keyConversationId !== "string"
    ) {
        return false;
    }

    if (keyConversationId !== params.conversationId) {
        return false;
    }

    return params.agentId === undefined || keyAgentId === params.agentId;
}

function createServerEvent(
    type: ServerEvent["type"],
    payload: ServerEvent["payload"],
): ServerEvent {
    return { type, payload };
}

function createRuntimeServerEvent(
    runtime: Pick<ConversationRuntime, "agentId" | "conversationId">,
    type: ServerEvent["type"],
    payload: Record<string, unknown>,
): ServerEvent {
    return createServerEvent(type, {
        agentId: runtime.agentId,
        conversationId: runtime.conversationId,
        ...payload,
    });
}

function mergeRuntimeSubscribers(
    primary: Map<string, RuntimeSubscriber>,
    secondary: Map<string, RuntimeSubscriber> | undefined,
): Map<string, RuntimeSubscriber> {
    const merged = new Map(primary);
    if (!secondary) {
        return merged;
    }

    for (const [subscriberId, subscriber] of secondary) {
        const existing = merged.get(subscriberId);
        merged.set(subscriberId, {
            sendEvent: subscriber.sendEvent,
            subscriptionCount:
                (existing?.subscriptionCount ?? 0) +
                subscriber.subscriptionCount,
            retainDuringActiveTurn:
                (existing?.retainDuringActiveTurn ?? false) ||
                subscriber.retainDuringActiveTurn,
        });
    }

    return merged;
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
    private readonly pendingRuntimeInitializations = new Map<
        string,
        PendingRuntimeInitialization
    >();
    private readonly getConfig: () => AgentchatConfig;
    private readonly persistence: RuntimePersistenceClient;
    private readonly createClient: CreateCodexClient;
    private readonly workspaceManager: WorkspaceManager | null;
    private readonly stateId: string | null;
    private readonly pendingRuntimeDeleteWaitMs: number;

    constructor(params: {
        getConfig: () => AgentchatConfig;
        persistence: RuntimePersistenceClient;
        createClient?: CreateCodexClient;
        workspaceManager?: WorkspaceManager;
        stateId?: string;
        pendingRuntimeDeleteWaitMs?: number;
    }) {
        this.getConfig = params.getConfig;
        this.persistence = params.persistence;
        this.createClient =
            params.createClient ??
            ((clientParams) => new CodexAppServerClient(clientParams));
        this.workspaceManager = params.workspaceManager ?? null;
        this.stateId = params.stateId ?? null;
        this.pendingRuntimeDeleteWaitMs =
            params.pendingRuntimeDeleteWaitMs ?? PENDING_RUNTIME_DELETE_WAIT_MS;
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
            createRuntimeServerEvent(runtime, "run.started", {
                runId,
                messageId: params.command.payload.assistantMessageId,
            }),
        );
        this.emitToSubscribers(
            runtime,
            createRuntimeServerEvent(runtime, "message.started", {
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
                        chatId: runtime.chatId,
                        userId: params.userId,
                        agentId: runtime.agentId,
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
                        workspaceMode: runtime.agent.workspaceMode,
                        workspaceRootPath: runtime.agent.rootPath,
                        workspaceCwd: runtime.cwd,
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
                        chatId: runtime.chatId,
                        userId: params.userId,
                        agentId: runtime.agentId,
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
                                chatId: runtime.chatId,
                                userId: failedTurn.userId,
                                agentId: runtime.agentId,
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
                            chatId: runtime.chatId,
                            userId: params.userId,
                            agentId: runtime.agentId,
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
                            workspaceMode: runtime.agent.workspaceMode,
                            workspaceRootPath: runtime.agent.rootPath,
                            workspaceCwd: runtime.cwd,
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
                    this.disposeRuntime(runtime, {
                        removeFromMap: true,
                        reason:
                            error instanceof Error
                                ? error
                                : new Error(errorMessage),
                    });
                    this.emitToSubscribers(
                        runtime,
                        createRuntimeServerEvent(runtime, "run.failed", {
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
        agentId: string;
    }): Promise<void> {
        const runtime = this.runtimes.get(
            getRuntimeKey(params.userId, params.agentId, params.conversationId),
        );
        if (!runtime?.activeTurn?.turnId) {
            return;
        }

        await runtime.client.request("turn/interrupt", {
            threadId: runtime.threadId,
            turnId: runtime.activeTurn.turnId,
        });
    }

    async deleteConversationWorkspace(params: {
        userId: string;
        conversationId: string;
        agentId: string;
        chatId?: string;
    }): Promise<void> {
        // Verify the chat no longer exists in Convex before deleting
        try {
            const stillExists = await this.persistence.chatExists(
                params.userId,
                params.agentId,
                params.conversationId,
                params.chatId,
            );
            if (stillExists) {
                console.warn(
                    `[agentchat-server] conversation.delete: chat still exists in Convex for ${params.conversationId}; ignoring`,
                );
                return;
            }
        } catch (error) {
            console.error(
                `[agentchat-server] conversation.delete: failed to verify chat deletion in Convex; ignoring`,
                error,
            );
            return;
        }

        // If there's a live runtime, verify the agentId matches before tearing down
        const key = getRuntimeKey(
            params.userId,
            params.agentId,
            params.conversationId,
        );
        const pendingInitialization =
            this.pendingRuntimeInitializations.get(key);
        this.cancelPendingRuntimeInitialization(
            key,
            new Error("Conversation deleted during runtime initialization."),
        );
        const runtime = this.runtimes.get(key);
        const shouldTearDownRuntime =
            runtime?.agentId === params.agentId || !runtime;
        if (runtime && !shouldTearDownRuntime) {
            console.warn(
                `[agentchat-server] conversation.delete: agentId mismatch (runtime=${runtime.agentId}, request=${params.agentId}); skipping runtime teardown but continuing workspace deletion`,
            );
        }

        // Tear down any active runtime for this conversation
        if (runtime && shouldTearDownRuntime) {
            this.disposeRuntime(runtime, {
                removeFromMap: true,
                reason: new Error("Conversation deleted during active turn."),
            });
            this.pendingSubscriptions.delete(key);
        }
        if (!runtime) {
            this.pendingSubscriptions.delete(key);
        }
        if (pendingInitialization) {
            const settled = await this.waitForPendingRuntimeInitialization(
                pendingInitialization,
            );
            if (!settled) {
                console.warn(
                    `[agentchat-server] conversation.delete: runtime initialization did not settle within ${this.pendingRuntimeDeleteWaitMs}ms for ${params.conversationId}; continuing workspace cleanup`,
                );
            }
        }

        // Delete the sandbox workspace if workspace manager is configured
        if (this.workspaceManager) {
            await this.workspaceManager.deleteWorkspace(
                params.agentId,
                params.userId,
                params.conversationId,
            );
        }
    }

    subscribe(params: {
        userId: string;
        conversationId: string;
        agentId: string;
        subscriberId: string;
        sendEvent: (event: ServerEvent) => void;
    }): Promise<void> | void {
        const key = getRuntimeKey(
            params.userId,
            params.agentId,
            params.conversationId,
        );
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
                agentId: params.agentId,
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
            createRuntimeServerEvent(runtime, "run.started", {
                runId: runtime.activeTurn.runId,
                messageId: runtime.activeTurn.currentMessageId,
            }),
        );
        params.sendEvent(
            createRuntimeServerEvent(runtime, "message.started", {
                runId: runtime.activeTurn.runId,
                messageId: runtime.activeTurn.currentMessageId,
                messageIndex: runtime.activeTurn.currentMessageIndex,
                kind: runtime.activeTurn.currentMessageKind,
                content: runtime.activeTurn.text,
            }),
        );

        if (runtime.activeTurn.text) {
            params.sendEvent(
                createRuntimeServerEvent(runtime, "message.delta", {
                    messageId: runtime.activeTurn.currentMessageId,
                    delta: runtime.activeTurn.text,
                    content: runtime.activeTurn.text,
                }),
            );
        }
    }

    /**
     * Returns composite agentId:userId:conversationId keys for live copied
     * workspaces that should be preserved during reconciliation.
     */
    getActiveConversationKeys(): Set<string> {
        const keys = new Set<string>();
        for (const runtime of this.runtimes.values()) {
            if (runtime.agent.workspaceMode !== "copy-on-conversation") {
                continue;
            }
            const sandboxRoot = path.dirname(
                path.dirname(path.dirname(runtime.cwd)),
            );
            keys.add(
                getWorkspaceActiveKeyFromSegments({
                    sandboxRoot,
                    agentIdSegment: runtime.agentId,
                    userIdSegment: getSandboxUserPathSegment(runtime.userId),
                    conversationIdSegment: getSandboxConversationPathSegment(
                        runtime.conversationId,
                    ),
                }),
            );
        }
        return keys;
    }

    unsubscribe(params: {
        subscriberId: string;
        conversationId?: string;
        agentId?: string;
    }): void {
        for (const runtime of this.runtimes.values()) {
            if (
                params.conversationId &&
                (runtime.conversationId !== params.conversationId ||
                    (params.agentId !== undefined &&
                        runtime.agentId !== params.agentId))
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
                !runtimeKeyMatchesConversation({
                    runtimeKey: key,
                    conversationId: params.conversationId,
                    agentId: params.agentId,
                })
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
            params.command.payload.agentId,
            params.command.payload.conversationId,
        );
        const pendingInitialization =
            this.pendingRuntimeInitializations.get(key);
        if (pendingInitialization) {
            return await pendingInitialization.promise;
        }
        const initializationState: PendingRuntimeInitialization = {
            cancelReason: null,
            client: null,
            promise: Promise.resolve(null as never),
        };
        const initialization = this.initializeRuntime(
            params,
            key,
            initializationState,
        );
        initializationState.promise = initialization;
        this.pendingRuntimeInitializations.set(key, initializationState);
        try {
            return await initialization;
        } finally {
            this.pendingRuntimeInitializations.delete(key);
        }
    }

    private async initializeRuntime(
        params: {
            userId: string;
            command: ConversationSendCommand;
            sendEvent: (event: ServerEvent) => void;
        },
        key: string,
        initializationState: PendingRuntimeInitialization,
    ): Promise<{ runtime: ConversationRuntime; isNew: boolean }> {
        const config = this.getConfig();
        const resources = resolveRuntimeResources(config, params.command);
        const desiredCwd = getDesiredRuntimeCwd({
            workspaceManager: this.workspaceManager,
            agent: resources.agent,
            userId: params.userId,
            conversationId: params.command.payload.conversationId,
        });
        const existing = this.runtimes.get(key);
        let shouldResetConversationState = false;
        let recycledSubscribers: Map<string, RuntimeSubscriber> | null = null;
        if (existing) {
            if (shouldRecycleRuntime(existing, resources, desiredCwd)) {
                if (existing.activeTurn) {
                    return { runtime: existing, isNew: false };
                }
                recycledSubscribers = new Map(existing.subscribers);
                shouldResetConversationState = shouldResetRuntimeState(
                    existing,
                    resources,
                    desiredCwd,
                );
                this.disposeRuntime(existing, {
                    removeFromMap: true,
                    reason: new Error("Conversation runtime recycled."),
                });
                if (
                    this.workspaceManager &&
                    existing.agent.workspaceMode === "copy-on-conversation" &&
                    existing.agent.id === resources.agent.id &&
                    shouldResetConversationState
                ) {
                    await this.workspaceManager.deleteWorkspacePath({
                        sandboxRoot: path.dirname(
                            path.dirname(path.dirname(existing.cwd)),
                        ),
                        targetPath: existing.cwd,
                        agentId: existing.agent.id,
                        userId: params.userId,
                        conversationId: params.command.payload.conversationId,
                    });
                }
            } else {
                existing.agent = resources.agent;
                existing.provider = resources.provider;
                existing.userId = params.userId;
                return { runtime: existing, isNew: false };
            }
        }

        let cwd = resources.agent.rootPath;
        let client: CodexClient | null = null;
        let cleanupWorkspaceOnFailure = false;
        try {
            const workspaceState = this.workspaceManager
                ? await this.workspaceManager.ensureWorkspaceState(
                      resources.agent,
                      params.userId,
                      params.command.payload.conversationId,
                  )
                : {
                      path: resources.agent.rootPath,
                      wasReset: false,
                      cleanupOnFailure: false,
                  };
            cwd = workspaceState.path;
            cleanupWorkspaceOnFailure = workspaceState.cleanupOnFailure;
            await this.throwIfRuntimeInitializationCancelled({
                initializationState,
                client: null,
                agent: resources.agent,
                userId: params.userId,
                conversationId: params.command.payload.conversationId,
                cwd,
                cleanupWorkspace: cleanupWorkspaceOnFailure,
            });
            const workspaceIdentity = getRuntimeWorkspaceIdentity(
                resources.agent,
                cwd,
            );

            client = this.createClient({
                provider: resources.provider,
                agent: { ...resources.agent, rootPath: cwd },
            });
            initializationState.client = client;
            await client.initialize();
            await this.throwIfRuntimeInitializationCancelled({
                initializationState,
                client,
                agent: resources.agent,
                userId: params.userId,
                conversationId: params.command.payload.conversationId,
                cwd,
                cleanupWorkspace: cleanupWorkspaceOnFailure,
            });
            const persistedState = await this.readConversationPersistenceState({
                userId: params.userId,
                agentId: resources.agent.id,
                conversationId: params.command.payload.conversationId,
                allowMissingConversation: false,
            });
            await this.throwIfRuntimeInitializationCancelled({
                initializationState,
                client,
                agent: resources.agent,
                userId: params.userId,
                conversationId: params.command.payload.conversationId,
                cwd,
                cleanupWorkspace: cleanupWorkspaceOnFailure,
            });
            invariant(
                persistedState,
                "Conversation not found during runtime initialization.",
            );
            const persistedBinding =
                shouldResetConversationState || workspaceState.wasReset
                    ? null
                    : persistedState.binding;
            const resumableBinding =
                persistedBinding &&
                !shouldResetPersistedRuntimeBinding(
                    persistedBinding,
                    workspaceIdentity,
                    this.canReuseLegacySharedBinding(
                        resources.agent,
                        persistedBinding,
                    ),
                )
                    ? persistedBinding
                    : null;
            const { threadId, isNew } = await this.openThread({
                client,
                resources,
                binding: resumableBinding,
                modelId: params.command.payload.modelId,
                cwd,
            });
            await this.throwIfRuntimeInitializationCancelled({
                initializationState,
                client,
                agent: resources.agent,
                userId: params.userId,
                conversationId: params.command.payload.conversationId,
                cwd,
                cleanupWorkspace: cleanupWorkspaceOnFailure,
            });

            const runtime: ConversationRuntime = {
                key,
                chatId: persistedState.chatId,
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
                subscribers: recycledSubscribers
                    ? new Map(recycledSubscribers)
                    : new Map(),
            };

            const pendingSubscribers = this.pendingSubscriptions.get(key);
            if (pendingSubscribers) {
                runtime.subscribers = mergeRuntimeSubscribers(
                    runtime.subscribers,
                    pendingSubscribers,
                );
                this.pendingSubscriptions.delete(key);
            }

            client.onNotification((notification) => {
                this.handleNotification(runtime, notification);
            });
            client.onExit((error) => {
                this.handleRuntimeExit(runtime, error);
            });

            await this.throwIfRuntimeInitializationCancelled({
                initializationState,
                client,
                agent: resources.agent,
                userId: params.userId,
                conversationId: params.command.payload.conversationId,
                cwd,
                cleanupWorkspace: cleanupWorkspaceOnFailure,
            });
            this.runtimes.set(key, runtime);
            return { runtime, isNew };
        } catch (error) {
            if (initializationState.cancelReason !== error) {
                await this.cleanupFailedRuntimeInitialization({
                    agent: resources.agent,
                    userId: params.userId,
                    conversationId: params.command.payload.conversationId,
                    cwd,
                    client,
                    cleanupWorkspace: cleanupWorkspaceOnFailure,
                });
            }
            throw error;
        }
    }

    private async throwIfRuntimeInitializationCancelled(params: {
        initializationState: PendingRuntimeInitialization;
        client: CodexClient | null;
        agent: AgentConfig;
        userId: string;
        conversationId: string;
        cwd: string;
        cleanupWorkspace: boolean;
    }): Promise<void> {
        const cancelReason = params.initializationState.cancelReason;
        if (!cancelReason) {
            return;
        }

        params.client?.stop();
        if (
            params.cleanupWorkspace &&
            this.workspaceManager &&
            params.agent.workspaceMode === "copy-on-conversation"
        ) {
            await this.workspaceManager.deleteWorkspace(
                params.agent.id,
                params.userId,
                params.conversationId,
            );
        }
        throw cancelReason;
    }

    private cancelPendingRuntimeInitialization(
        key: string,
        reason: Error,
    ): PendingRuntimeInitialization | null {
        const pendingInitialization =
            this.pendingRuntimeInitializations.get(key) ?? null;
        if (!pendingInitialization) {
            return null;
        }

        pendingInitialization.cancelReason ??= reason;
        pendingInitialization.client?.stop();
        return pendingInitialization;
    }

    private async waitForPendingRuntimeInitialization(
        pendingInitialization: PendingRuntimeInitialization,
    ): Promise<boolean> {
        const settledPromise = pendingInitialization.promise.then(
            () => true,
            () => true,
        );
        const timeoutPromise = new Promise<boolean>((resolve) => {
            setTimeout(() => resolve(false), this.pendingRuntimeDeleteWaitMs);
        });
        return await Promise.race([settledPromise, timeoutPromise]);
    }

    private async cleanupFailedRuntimeInitialization(params: {
        agent: AgentConfig;
        userId: string;
        conversationId: string;
        cwd: string;
        client: CodexClient | null;
        cleanupWorkspace: boolean;
    }): Promise<void> {
        params.client?.stop();
        if (
            params.cleanupWorkspace &&
            this.workspaceManager &&
            params.agent.workspaceMode === "copy-on-conversation"
        ) {
            await this.workspaceManager.deleteWorkspace(
                params.agent.id,
                params.userId,
                params.conversationId,
            );
        }
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

    private async readConversationPersistenceState(params: {
        userId: string;
        agentId: string;
        conversationId: string;
        allowMissingConversation: boolean;
    }): Promise<PersistedConversationRuntimeState | null> {
        const persistedState = await this.persistence.readRuntimeBinding({
            userId: params.userId,
            agentId: params.agentId,
            conversationLocalId: params.conversationId,
        });
        if (persistedState) {
            return persistedState;
        }
        if (params.allowMissingConversation) {
            return null;
        }

        throw new Error("Conversation not found");
    }

    private async recoverOrphanedActiveRun(params: {
        userId: string;
        conversationId: string;
        agentId: string;
    }): Promise<void> {
        const persistedState = await this.readConversationPersistenceState({
            userId: params.userId,
            agentId: params.agentId,
            conversationId: params.conversationId,
            allowMissingConversation: true,
        });
        const persistedBinding = persistedState?.binding ?? null;
        if (
            !persistedState ||
            !persistedBinding ||
            persistedBinding.status !== "active" ||
            !persistedBinding.activeRunId
        ) {
            return;
        }

        await this.persistence.recoverStaleRun({
            chatId: persistedState.chatId,
            userId: params.userId,
            agentId: params.agentId,
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
        if (this.runtimes.get(runtime.key) !== runtime) {
            return;
        }

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
                    createRuntimeServerEvent(runtime, "message.completed", {
                        messageId: activeTurn.currentMessageId,
                        content: activeTurn.text,
                    }),
                );
            }

            const sequence = activeTurn.nextSequence;
            activeTurn.nextSequence += 2;
            void this.persistence
                .runFailed({
                    chatId: runtime.chatId,
                    userId: activeTurn.userId,
                    agentId: runtime.agentId,
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
                createRuntimeServerEvent(runtime, "run.failed", {
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
                chatId: runtime.chatId,
                userId: runtime.userId,
                agentId: runtime.agentId,
                conversationLocalId: runtime.conversationId,
                provider: runtime.provider.id,
                status: "errored",
                providerThreadId: runtime.threadId,
                providerResumeToken: null,
                activeRunId: null,
                lastError: error.message,
                lastEventAt: Date.now(),
                expiresAt: null,
                workspaceMode: runtime.agent.workspaceMode,
                workspaceRootPath: runtime.agent.rootPath,
                workspaceCwd: runtime.cwd,
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
                    createRuntimeServerEvent(runtime, "message.started", {
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
                    createRuntimeServerEvent(runtime, "message.delta", {
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
                    chatId: runtime.chatId,
                    userId: activeTurn.userId,
                    agentId: runtime.agentId,
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
                createRuntimeServerEvent(runtime, "message.delta", {
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
            createRuntimeServerEvent(runtime, "message.completed", {
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
            createRuntimeServerEvent(runtime, "message.started", {
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
                chatId: runtime.chatId,
                userId: activeTurn.userId,
                agentId: runtime.agentId,
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
            createRuntimeServerEvent(runtime, "message.completed", {
                messageId: activeTurn.currentMessageId,
                content: activeTurn.text,
            }),
        );

        this.cancelPendingMessageDelta(activeTurn);
        await activeTurn.inFlightDeltaFlush;
        await activeTurn.pendingMessageStartPersistence;
        if (
            this.runtimes.get(runtime.key) !== runtime ||
            runtime.activeTurn !== activeTurn
        ) {
            return;
        }

        const sequence = activeTurn.nextSequence;
        activeTurn.nextSequence += 2;
        const completedAt = Date.now();

        if (params.finalStatus === "completed") {
            void this.persistence
                .runCompleted({
                    chatId: runtime.chatId,
                    userId: activeTurn.userId,
                    agentId: runtime.agentId,
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
                createRuntimeServerEvent(runtime, "run.completed", {
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
                    chatId: runtime.chatId,
                    userId: activeTurn.userId,
                    agentId: runtime.agentId,
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
                createRuntimeServerEvent(runtime, "run.interrupted", {
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
                chatId: runtime.chatId,
                userId: activeTurn.userId,
                agentId: runtime.agentId,
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
            createRuntimeServerEvent(runtime, "run.failed", {
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

        const idleTimer = setTimeout(() => {
            if (
                this.runtimes.get(runtime.key) !== runtime ||
                runtime.idleTimer !== idleTimer ||
                runtime.activeTurn
            ) {
                return;
            }
            runtime.idleTimer = null;

            void this.persistence
                .runtimeBinding({
                    chatId: runtime.chatId,
                    userId: runtime.userId,
                    agentId: runtime.agentId,
                    conversationLocalId: runtime.conversationId,
                    provider: runtime.provider.id,
                    status: "expired",
                    providerThreadId: runtime.threadId,
                    providerResumeToken: null,
                    activeRunId: null,
                    lastError: null,
                    lastEventAt: Date.now(),
                    expiresAt: Date.now(),
                    workspaceMode: runtime.agent.workspaceMode,
                    workspaceRootPath: runtime.agent.rootPath,
                    workspaceCwd: runtime.cwd,
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
        runtime.idleTimer = idleTimer;
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
            chatId: runtime.chatId,
            userId: activeTurn.userId,
            agentId: runtime.agentId,
            conversationLocalId: runtime.conversationId,
            assistantMessageLocalId: activeTurn.currentMessageId,
            externalRunId: activeTurn.runId,
            sequence: activeTurn.nextSequence++,
            content: activeTurn.text,
            delta,
            createdAt: Date.now(),
        });
    }

    private disposeRuntime(
        runtime: ConversationRuntime,
        params: {
            removeFromMap: boolean;
            reason: Error;
        },
    ): void {
        if (runtime.idleTimer) {
            clearTimeout(runtime.idleTimer);
            runtime.idleTimer = null;
        }

        if (runtime.activeTurn) {
            this.cancelPendingMessageDelta(runtime.activeTurn);
            runtime.activeTurn.reject(params.reason);
            runtime.activeTurn = null;
        }

        runtime.client.stop();
        if (
            params.removeFromMap &&
            this.runtimes.get(runtime.key) === runtime
        ) {
            this.runtimes.delete(runtime.key);
        }
    }

    private canReuseLegacySharedBinding(
        agent: AgentConfig,
        binding: PersistedRuntimeBinding,
    ): boolean {
        if (!this.stateId) {
            return true;
        }

        try {
            const currentRootPath = canonicalizePathForComparison(
                agent.rootPath,
            );
            const history = this.readLegacySharedRootHistory();
            const existing = history[agent.id];
            if (!existing) {
                const changedAt = Date.now();
                history[agent.id] = {
                    rootPath: currentRootPath,
                    changedAt,
                };
                this.writeLegacySharedRootHistory(history);
                return binding.updatedAt >= changedAt;
            }

            if (existing.rootPath !== currentRootPath) {
                const changedAt = Date.now();
                history[agent.id] = {
                    rootPath: currentRootPath,
                    changedAt,
                };
                this.writeLegacySharedRootHistory(history);
                return binding.updatedAt >= changedAt;
            }

            return binding.updatedAt >= existing.changedAt;
        } catch {
            return false;
        }
    }

    private readLegacySharedRootHistory(): LegacySharedRootHistory {
        if (!this.stateId) {
            return {};
        }

        const historyPath = getLegacySharedRootHistoryPath(this.stateId);
        if (!existsSync(historyPath)) {
            return {};
        }

        try {
            const parsed = JSON.parse(
                readFileSync(historyPath, "utf8"),
            ) as Record<string, unknown>;
            const history: LegacySharedRootHistory = {};
            for (const [agentId, value] of Object.entries(parsed)) {
                if (
                    !value ||
                    typeof value !== "object" ||
                    typeof (value as { rootPath?: unknown }).rootPath !==
                        "string" ||
                    typeof (value as { changedAt?: unknown }).changedAt !==
                        "number"
                ) {
                    continue;
                }

                history[agentId] = {
                    rootPath: canonicalizePathForComparison(
                        (value as { rootPath: string }).rootPath,
                    ),
                    changedAt: Math.max(
                        0,
                        (value as { changedAt: number }).changedAt,
                    ),
                };
            }
            return history;
        } catch {
            return {};
        }
    }

    private writeLegacySharedRootHistory(
        history: LegacySharedRootHistory,
    ): void {
        if (!this.stateId) {
            return;
        }

        const historyPath = getLegacySharedRootHistoryPath(this.stateId);
        mkdirSync(path.dirname(historyPath), { recursive: true });
        writeFileSync(
            historyPath,
            `${JSON.stringify(history, null, 2)}\n`,
            "utf8",
        );
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
    desiredCwd: string,
): boolean {
    if (runtime.agent.id !== resources.agent.id) {
        return true;
    }

    if (
        !runtimeWorkspaceMatches(
            getRuntimeWorkspaceIdentity(runtime.agent, runtime.cwd),
            getRuntimeWorkspaceIdentity(resources.agent, desiredCwd),
        )
    ) {
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

function shouldResetRuntimeState(
    runtime: ConversationRuntime,
    resources: ResolvedRuntimeResources,
    desiredCwd: string,
): boolean {
    return (
        runtime.agent.id !== resources.agent.id ||
        !runtimeWorkspaceMatches(
            getRuntimeWorkspaceIdentity(runtime.agent, runtime.cwd),
            getRuntimeWorkspaceIdentity(resources.agent, desiredCwd),
        )
    );
}

function getRuntimeWorkspaceIdentity(
    agent: AgentConfig,
    cwd: string,
): RuntimeWorkspaceIdentity {
    return {
        workspaceMode: agent.workspaceMode,
        workspaceRootPath: canonicalizePathForComparison(agent.rootPath),
        workspaceCwd: canonicalizePathForComparison(cwd),
    };
}

function shouldResetPersistedRuntimeBinding(
    binding: PersistedRuntimeBinding,
    desired: RuntimeWorkspaceIdentity,
    allowLegacySharedBindingReuse: boolean,
): boolean {
    if (
        desired.workspaceMode === "shared" &&
        binding.workspaceMode === undefined &&
        binding.workspaceRootPath === undefined &&
        binding.workspaceCwd === undefined
    ) {
        return !allowLegacySharedBindingReuse;
    }

    return !runtimeWorkspaceMatches(
        {
            workspaceMode: binding.workspaceMode,
            workspaceRootPath: binding.workspaceRootPath,
            workspaceCwd: binding.workspaceCwd,
        },
        desired,
    );
}

function runtimeWorkspaceMatches(
    current:
        | RuntimeWorkspaceIdentity
        | {
              workspaceMode?: "shared" | "copy-on-conversation";
              workspaceRootPath?: string;
              workspaceCwd?: string;
          },
    desired: RuntimeWorkspaceIdentity,
): boolean {
    return (
        current.workspaceMode === desired.workspaceMode &&
        canonicalizeRuntimeWorkspacePath(current.workspaceRootPath) ===
            desired.workspaceRootPath &&
        canonicalizeRuntimeWorkspacePath(current.workspaceCwd) ===
            desired.workspaceCwd
    );
}

function canonicalizeRuntimeWorkspacePath(
    targetPath: string | undefined,
): string | undefined {
    if (targetPath === undefined) {
        return undefined;
    }

    return canonicalizePathForComparison(targetPath);
}

function getDesiredRuntimeCwd(params: {
    workspaceManager: WorkspaceManager | null;
    agent: AgentConfig;
    userId: string;
    conversationId: string;
}): string {
    if (
        !params.workspaceManager ||
        params.agent.workspaceMode !== "copy-on-conversation"
    ) {
        return params.agent.rootPath;
    }

    return params.workspaceManager.getWorkspacePath(
        params.agent.id,
        params.userId,
        params.conversationId,
    );
}
