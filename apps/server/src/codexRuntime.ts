import path from "node:path";

import { getProviderConfig } from "./config.ts";
import type { AgentchatConfig, AgentConfig, ProviderConfig } from "./config.ts";
import { canonicalizePathForComparison } from "./pathComparison.ts";
import { type CreateCodexClient } from "./codexAppServerClient.ts";
import {
    CodexRuntimeKind,
    isRecoverableThreadResumeError,
} from "./codexRuntimeKind.ts";
import type {
    RuntimeKind,
    RuntimeKindEvent,
    RuntimeKindLifecycleResult,
    RuntimeKindSession,
    RuntimeProviderEvent,
} from "./runtimeKind.ts";
import {
    RuntimeKindRegistry,
    runtimeKindRegistryFromSingleKind,
} from "./runtimeKindRegistry.ts";
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
    isSafePathSegment,
} from "./sandboxPaths.ts";
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
    pendingRunStartPersistence: Promise<void> | null;
    pendingMessageStartPersistence: Promise<void> | null;
    queuedEvents: RuntimeKindEvent[];
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
    session: RuntimeKindSession;
    threadId: string;
    pendingProviderEvents: RuntimeProviderEvent[];
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

type RuntimeWorkspaceMode = RuntimeWorkspaceIdentity["workspaceMode"];

type RuntimeKeyParts = {
    workspaceMode: RuntimeWorkspaceMode | null;
    userId: string;
    agentId: string;
    conversationId: string;
};

type PendingRuntimeInitialization = {
    cancelReason: Error | null;
    session: RuntimeKindSession | null;
    promise: Promise<{ runtime: ConversationRuntime; isNew: boolean }>;
};

const PENDING_RUNTIME_DELETE_WAIT_MS = 1_000;

function invariant(condition: unknown, message: string): asserts condition {
    if (!condition) {
        throw new Error(message);
    }
}

function getRuntimeKey(
    userId: string,
    agentId: string,
    conversationId: string,
    workspaceMode: RuntimeWorkspaceMode,
): string {
    return JSON.stringify([workspaceMode, userId, agentId, conversationId]);
}

function parseRuntimeKey(runtimeKey: string): RuntimeKeyParts | null {
    let parsed: unknown;
    try {
        parsed = JSON.parse(runtimeKey);
    } catch {
        return null;
    }

    if (!Array.isArray(parsed)) {
        return null;
    }

    if (parsed.length === 4) {
        const [workspaceMode, userId, agentId, conversationId] = parsed;
        if (
            (workspaceMode !== "shared" &&
                workspaceMode !== "copy-on-conversation") ||
            typeof userId !== "string" ||
            typeof agentId !== "string" ||
            typeof conversationId !== "string"
        ) {
            return null;
        }

        return {
            workspaceMode,
            userId,
            agentId,
            conversationId,
        };
    }

    if (parsed.length === 3) {
        const [userId, agentId, conversationId] = parsed;
        if (
            typeof userId !== "string" ||
            typeof agentId !== "string" ||
            typeof conversationId !== "string"
        ) {
            return null;
        }

        return {
            workspaceMode: null,
            userId,
            agentId,
            conversationId,
        };
    }

    return null;
}

function runtimeKeyMatchesConversation(params: {
    runtimeKey: string;
    userId?: string;
    conversationId: string;
    agentId?: string;
}): boolean {
    const parsed = parseRuntimeKey(params.runtimeKey);
    if (!parsed) {
        return false;
    }

    if (params.userId !== undefined && parsed.userId !== params.userId) {
        return false;
    }

    if (parsed.conversationId !== params.conversationId) {
        return false;
    }

    return params.agentId === undefined || parsed.agentId === params.agentId;
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

function isRecoverablePersistenceMissingResource(error: unknown): boolean {
    const message =
        error instanceof Error ? error.message : String(error ?? "");
    return (
        message.includes("Conversation not found") ||
        message.includes("Assistant message not found")
    );
}

export { isRecoverableThreadResumeError };

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

export class CodexRuntimeManager {
    private readonly runtimes = new Map<string, ConversationRuntime>();
    private readonly pendingSubscriptions = new Map<
        string,
        Map<string, RuntimeSubscriber>
    >();
    private readonly closedSubscribers = new Set<string>();
    private readonly pendingSubscriberResolutions = new Map<string, number>();
    private readonly pendingRuntimeInitializations = new Map<
        string,
        PendingRuntimeInitialization
    >();
    private readonly getConfig: () => AgentchatConfig;
    private readonly persistence: RuntimePersistenceClient;
    private readonly runtimeKinds: RuntimeKindRegistry;
    private readonly workspaceManager: WorkspaceManager | null;
    private readonly pendingRuntimeDeleteWaitMs: number;
    private lastPersistenceTimestamp = 0;

    constructor(params: {
        getConfig: () => AgentchatConfig;
        persistence: RuntimePersistenceClient;
        createClient?: CreateCodexClient;
        runtimeKind?: RuntimeKind;
        runtimeKinds?: RuntimeKindRegistry;
        workspaceManager?: WorkspaceManager;
        pendingRuntimeDeleteWaitMs?: number;
    }) {
        this.getConfig = params.getConfig;
        this.persistence = params.persistence;
        this.runtimeKinds =
            params.runtimeKinds ??
            (params.runtimeKind
                ? runtimeKindRegistryFromSingleKind(params.runtimeKind)
                : params.createClient
                  ? new RuntimeKindRegistry([
                        new CodexRuntimeKind({
                            createClient: params.createClient,
                        }),
                    ])
                  : RuntimeKindRegistry.default());
        this.workspaceManager = params.workspaceManager ?? null;
        this.pendingRuntimeDeleteWaitMs =
            params.pendingRuntimeDeleteWaitMs ?? PENDING_RUNTIME_DELETE_WAIT_MS;
    }

    private nextPersistenceTimestamp(): number {
        const now = Date.now();
        const nextTimestamp = Math.max(now, this.lastPersistenceTimestamp + 1);
        this.lastPersistenceTimestamp = nextTimestamp;
        return nextTimestamp;
    }

    private getRuntimeKeyForConfiguredAgent(params: {
        userId: string;
        agentId: string;
        conversationId: string;
    }): string {
        const workspaceMode =
            this.getConfig().agents.find((agent) => agent.id === params.agentId)
                ?.workspaceMode ?? "shared";
        return getRuntimeKey(
            params.userId,
            params.agentId,
            params.conversationId,
            workspaceMode,
        );
    }

    private findRuntimeForConversation(params: {
        userId: string;
        agentId: string;
        conversationId: string;
    }): ConversationRuntime | null {
        for (const runtime of this.runtimes.values()) {
            if (
                runtime.userId === params.userId &&
                runtime.agentId === params.agentId &&
                runtime.conversationId === params.conversationId
            ) {
                return runtime;
            }
        }

        return null;
    }

    private findPendingRuntimeInitializationForConversation(params: {
        userId: string;
        agentId: string;
        conversationId: string;
    }): PendingRuntimeInitialization | null {
        for (const [key, pendingInitialization] of this
            .pendingRuntimeInitializations) {
            if (
                runtimeKeyMatchesConversation({
                    runtimeKey: key,
                    userId: params.userId,
                    agentId: params.agentId,
                    conversationId: params.conversationId,
                })
            ) {
                return pendingInitialization;
            }
        }

        return null;
    }

    private getRuntimeKeysForConversation(params: {
        userId: string;
        agentId: string;
        conversationId: string;
    }): string[] {
        const keys = new Set<string>([
            this.getRuntimeKeyForConfiguredAgent(params),
        ]);
        for (const key of this.runtimes.keys()) {
            if (
                runtimeKeyMatchesConversation({
                    runtimeKey: key,
                    userId: params.userId,
                    agentId: params.agentId,
                    conversationId: params.conversationId,
                })
            ) {
                keys.add(key);
            }
        }
        for (const key of this.pendingRuntimeInitializations.keys()) {
            if (
                runtimeKeyMatchesConversation({
                    runtimeKey: key,
                    userId: params.userId,
                    agentId: params.agentId,
                    conversationId: params.conversationId,
                })
            ) {
                keys.add(key);
            }
        }
        for (const key of this.pendingSubscriptions.keys()) {
            if (
                runtimeKeyMatchesConversation({
                    runtimeKey: key,
                    userId: params.userId,
                    agentId: params.agentId,
                    conversationId: params.conversationId,
                })
            ) {
                keys.add(key);
            }
        }

        return [...keys];
    }

    private drainPendingSubscriptionsForConversation(params: {
        runtimeKey: string;
        userId: string;
        agentId: string;
        conversationId: string;
    }): Map<string, RuntimeSubscriber> {
        let subscribers =
            this.pendingSubscriptions.get(params.runtimeKey) ?? new Map();
        this.pendingSubscriptions.delete(params.runtimeKey);

        for (const [key, pendingSubscribers] of this.pendingSubscriptions) {
            if (
                !runtimeKeyMatchesConversation({
                    runtimeKey: key,
                    userId: params.userId,
                    agentId: params.agentId,
                    conversationId: params.conversationId,
                })
            ) {
                continue;
            }

            subscribers = mergeRuntimeSubscribers(
                subscribers,
                pendingSubscribers,
            );
            this.pendingSubscriptions.delete(key);
        }

        return subscribers;
    }

    async sendMessage(params: {
        userId: string;
        subscriberId: string;
        command: ConversationSendCommand;
        sendEvent: (event: ServerEvent) => void;
    }): Promise<void> {
        const { runtime, isNew } = await this.ensureRuntime({
            ...params,
            command: params.command,
        });
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
                pendingRunStartPersistence: null,
                pendingMessageStartPersistence: null,
                queuedEvents: [],
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

                    const startedAt = this.nextPersistenceTimestamp();
                    let releaseRunStartNotificationGate: () => void = () =>
                        undefined;
                    activeTurn.pendingRunStartPersistence = new Promise<void>(
                        (resolve) => {
                            releaseRunStartNotificationGate = resolve;
                        },
                    );

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
                        providerConversationId: runtime.threadId,
                        providerTurnId: null,
                        workspaceMode: runtime.agent.workspaceMode,
                        workspaceRootPath: runtime.agent.rootPath,
                        workspaceCwd: runtime.cwd,
                        startedAt,
                    });

                    const inputText = isNew
                        ? buildInitialTurnText(
                              params.command.payload.history,
                              params.command.payload.content,
                          )
                        : params.command.payload.content;

                    const turnResult = await runtime.session.startTurn({
                        threadId: runtime.threadId,
                        inputText,
                        cwd: runtime.cwd,
                        modelId: params.command.payload.modelId,
                        variantId: params.command.payload.variantId ?? null,
                    });

                    activeTurn.turnId = turnResult.turnId;
                    runtime.modelId = params.command.payload.modelId;
                    const providerEvents = [
                        ...runtime.pendingProviderEvents.splice(0),
                        ...(turnResult.providerEvents ?? []),
                    ];

                    if (
                        this.runtimes.get(runtime.key) !== runtime ||
                        runtime.activeTurn !== activeTurn
                    ) {
                        return;
                    }

                    activeTurn.pendingRunStartPersistence = null;
                    releaseRunStartNotificationGate();

                    this.emitToSubscribers(
                        runtime,
                        createRuntimeServerEvent(runtime, "run.started", {
                            runId,
                            messageId:
                                params.command.payload.assistantMessageId,
                        }),
                    );
                    this.emitToSubscribers(
                        runtime,
                        createRuntimeServerEvent(runtime, "message.started", {
                            runId,
                            messageId:
                                params.command.payload.assistantMessageId,
                            messageIndex: 0,
                            kind: "assistant_message",
                            content: "",
                        }),
                    );

                    for (const providerEvent of providerEvents) {
                        this.recordProviderEvent(
                            runtime,
                            activeTurn,
                            providerEvent,
                        );
                    }

                    const queuedEvents = activeTurn.queuedEvents.splice(0);
                    for (const queuedEvent of queuedEvents) {
                        this.handleRuntimeEvent(runtime, queuedEvent);
                    }
                } catch (error) {
                    const errorMessage =
                        error instanceof Error
                            ? error.message
                            : "Failed to start Codex turn";
                    if (runtime.activeTurn?.turnId) {
                        try {
                            await runtime.session.interruptTurn({
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
                        failedTurn.queuedEvents.length = 0;
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
                                workspaceMode: runtime.agent.workspaceMode,
                                workspaceRootPath: runtime.agent.rootPath,
                                workspaceCwd: runtime.cwd,
                                completedAt: this.nextPersistenceTimestamp(),
                                errorMessage,
                            });
                        } catch (persistError) {
                            console.error(
                                "[agentchat-server] failed to persist send-start failure",
                                persistError,
                            );
                        }
                    }
                    const erroredBindingUpdatedAt =
                        this.nextPersistenceTimestamp();
                    void this.persistence
                        .runtimeBinding({
                            chatId: runtime.chatId,
                            userId: params.userId,
                            agentId: runtime.agentId,
                            conversationLocalId:
                                params.command.payload.conversationId,
                            provider: runtime.provider.id,
                            status: "errored",
                            providerConversationId: runtime.threadId,
                            activeRunId: null,
                            lastError: errorMessage,
                            lastEventAt: erroredBindingUpdatedAt,
                            expiresAt: null,
                            workspaceMode: runtime.agent.workspaceMode,
                            workspaceRootPath: runtime.agent.rootPath,
                            workspaceCwd: runtime.cwd,
                            updatedAt: erroredBindingUpdatedAt,
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
                    await this.disposeRuntime(runtime, {
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
        const runtime = this.findRuntimeForConversation(params);
        if (!runtime?.activeTurn?.turnId) {
            return;
        }

        await runtime.session.interruptTurn({
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

        // Tear down every live or initializing runtime for this conversation,
        // including runtimes keyed under a previous workspace mode.
        const keys = this.getRuntimeKeysForConversation(params);
        const pendingInitializations = keys
            .map((key) => this.pendingRuntimeInitializations.get(key) ?? null)
            .filter(
                (
                    pendingInitialization,
                ): pendingInitialization is PendingRuntimeInitialization =>
                    pendingInitialization !== null,
            );
        for (const key of keys) {
            this.cancelPendingRuntimeInitialization(
                key,
                new Error(
                    "Conversation deleted during runtime initialization.",
                ),
            );
        }
        const runtimes = keys
            .map((key) => this.runtimes.get(key) ?? null)
            .filter(
                (runtime): runtime is ConversationRuntime => runtime !== null,
            );
        const runtime = runtimes[0] ?? null;

        // Tear down any active runtime for this conversation
        for (const runtimeToDispose of runtimes) {
            await this.disposeRuntime(runtimeToDispose, {
                removeFromMap: true,
                reason: new Error("Conversation deleted during active turn."),
            });
            this.pendingSubscriptions.delete(runtimeToDispose.key);
        }
        for (const key of keys) {
            this.pendingSubscriptions.delete(key);
        }
        for (const pendingInitialization of pendingInitializations) {
            const settled = await this.waitForPendingRuntimeInitialization(
                pendingInitialization,
            );
            if (!settled) {
                console.warn(
                    `[agentchat-server] conversation.delete: runtime initialization did not settle within ${this.pendingRuntimeDeleteWaitMs}ms for ${params.conversationId}; continuing workspace cleanup`,
                );
            }
        }

        const configuredAgent = this.getConfig().agents.find(
            (agent) => agent.id === params.agentId,
        );
        const shouldDeleteCopiedWorkspace =
            runtime?.agent?.workspaceMode === "copy-on-conversation" ||
            configuredAgent?.workspaceMode === "copy-on-conversation" ||
            (configuredAgent === undefined &&
                isSafePathSegment(params.agentId));

        // Delete the sandbox workspace if workspace manager is configured
        if (this.workspaceManager && shouldDeleteCopiedWorkspace) {
            const currentSandboxRoots = new Set(
                this.workspaceManager.listCurrentSandboxRoots(),
            );
            const inactiveKnownSandboxRoots = this.workspaceManager
                .listKnownSandboxRoots()
                .filter((sandboxRoot) => !currentSandboxRoots.has(sandboxRoot));
            await this.workspaceManager.deleteWorkspace(
                params.agentId,
                params.userId,
                params.conversationId,
                {
                    sandboxRoots: [
                        this.getConfig().sandboxRoot,
                        ...inactiveKnownSandboxRoots,
                    ],
                    force:
                        runtime?.agent?.workspaceMode ===
                            "copy-on-conversation" &&
                        configuredAgent?.workspaceMode !==
                            "copy-on-conversation",
                },
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
        this.beginSubscriberResolution(params.subscriberId);
        this.closedSubscribers.delete(params.subscriberId);
        return this.subscribeResolved(params).finally(() => {
            this.finishSubscriberResolution(params.subscriberId);
        });
    }

    private async subscribeResolved(params: {
        userId: string;
        conversationId: string;
        agentId: string;
        subscriberId: string;
        sendEvent: (event: ServerEvent) => void;
    }): Promise<void> {
        if (this.closedSubscribers.has(params.subscriberId)) {
            return;
        }
        const key = this.getRuntimeKeyForConfiguredAgent(params);
        const runtime =
            this.runtimes.get(key) ?? this.findRuntimeForConversation(params);
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
        if (this.closedSubscribers.has(params.subscriberId)) {
            this.unsubscribe({
                subscriberId: params.subscriberId,
                conversationId: params.conversationId,
                agentId: params.agentId,
            });
            return;
        }
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
     * Returns composite workspace-mode:sandboxRoot:agentId:userId:conversationId
     * keys for live copied workspaces that should be preserved during reconciliation.
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
        if (!params.conversationId) {
            this.closedSubscribers.add(params.subscriberId);
        }
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

        this.maybeClearClosedSubscriber(params.subscriberId);
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
            resources.agent.id,
            params.command.payload.conversationId,
            resources.agent.workspaceMode,
        );
        const pendingInitialization =
            this.pendingRuntimeInitializations.get(key) ??
            this.findPendingRuntimeInitializationForConversation({
                userId: params.userId,
                agentId: resources.agent.id,
                conversationId: params.command.payload.conversationId,
            });
        if (pendingInitialization) {
            return await pendingInitialization.promise;
        }
        const initializationState: PendingRuntimeInitialization = {
            cancelReason: null,
            session: null,
            promise: Promise.resolve(null as never),
        };
        const initialization = this.initializeRuntime(
            params,
            key,
            initializationState,
            resources,
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
        resources: ResolvedRuntimeResources,
    ): Promise<{ runtime: ConversationRuntime; isNew: boolean }> {
        const desiredCwd = getDesiredRuntimeCwd({
            workspaceManager: this.workspaceManager,
            agent: resources.agent,
            userId: params.userId,
            conversationId: params.command.payload.conversationId,
        });
        const existing =
            this.runtimes.get(key) ??
            this.findRuntimeForConversation({
                userId: params.userId,
                agentId: resources.agent.id,
                conversationId: params.command.payload.conversationId,
            });
        let shouldResetConversationState = false;
        if (existing) {
            if (
                shouldRecycleRuntime(
                    existing,
                    resources,
                    desiredCwd,
                    this.runtimeKinds.get(existing.provider.kind),
                )
            ) {
                if (existing.activeTurn) {
                    return { runtime: existing, isNew: false };
                }
                let recycledSubscribers = mergeRuntimeSubscribers(
                    this.pendingSubscriptions.get(key) ?? new Map(),
                    existing.subscribers,
                );
                if (existing.key !== key) {
                    recycledSubscribers = mergeRuntimeSubscribers(
                        recycledSubscribers,
                        this.pendingSubscriptions.get(existing.key),
                    );
                    this.pendingSubscriptions.delete(existing.key);
                }
                if (recycledSubscribers.size > 0) {
                    this.pendingSubscriptions.set(key, recycledSubscribers);
                }
                existing.subscribers = new Map();
                shouldResetConversationState = shouldResetRuntimeState(
                    existing,
                    resources,
                    desiredCwd,
                );
                await this.disposeRuntime(existing, {
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
        let session: RuntimeKindSession | null = null;
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
                session: null,
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

            session = this.runtimeKinds
                .get(resources.provider.kind)
                .createSession({
                    provider: resources.provider,
                    agent: { ...resources.agent, rootPath: cwd },
                });
            initializationState.session = session;
            const initializeResult = await session.initialize();
            const pendingProviderEvents = [
                ...(initializeResult.providerEvents ?? []),
            ];
            await this.throwIfRuntimeInitializationCancelled({
                initializationState,
                session,
                agent: resources.agent,
                userId: params.userId,
                conversationId: params.command.payload.conversationId,
                cwd,
                cleanupWorkspace: cleanupWorkspaceOnFailure,
            });
            await this.recoverOrphanedActiveRun({
                userId: params.userId,
                conversationId: params.command.payload.conversationId,
                agentId: resources.agent.id,
            });
            const persistedState = await this.readConversationPersistenceState({
                userId: params.userId,
                agentId: resources.agent.id,
                conversationId: params.command.payload.conversationId,
                allowMissingConversation: false,
            });
            await this.throwIfRuntimeInitializationCancelled({
                initializationState,
                session,
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
                )
                    ? persistedBinding
                    : null;
            const openThreadResult = await this.openThread({
                session,
                provider: resources.provider,
                bindingProviderId: resumableBinding?.provider ?? null,
                bindingThreadId: resumableBinding
                    ? getPersistedProviderConversationId(resumableBinding)
                    : null,
                modelId: params.command.payload.modelId,
                cwd,
            });
            const { threadId, isNew } = openThreadResult;
            pendingProviderEvents.push(
                ...(openThreadResult.providerEvents ?? []),
            );
            await this.throwIfRuntimeInitializationCancelled({
                initializationState,
                session,
                agent: resources.agent,
                userId: params.userId,
                conversationId: params.command.payload.conversationId,
                cwd,
                cleanupWorkspace: cleanupWorkspaceOnFailure,
            });
            const bindingUpdatedAt = this.nextPersistenceTimestamp();
            await this.persistence.runtimeBinding({
                chatId: persistedState.chatId,
                userId: params.userId,
                agentId: resources.agent.id,
                conversationLocalId: params.command.payload.conversationId,
                provider: resources.provider.id,
                status: "idle",
                providerConversationId: threadId,
                activeRunId: null,
                lastError: null,
                lastEventAt: bindingUpdatedAt,
                expiresAt: null,
                workspaceMode: resources.agent.workspaceMode,
                workspaceRootPath: resources.agent.rootPath,
                workspaceCwd: cwd,
                updatedAt: bindingUpdatedAt,
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
                session,
                threadId,
                pendingProviderEvents,
                activeTurn: null,
                idleTimer: null,
                subscribers: new Map(),
            };

            const pendingSubscribers =
                this.drainPendingSubscriptionsForConversation({
                    runtimeKey: key,
                    userId: params.userId,
                    agentId: resources.agent.id,
                    conversationId: params.command.payload.conversationId,
                });
            if (pendingSubscribers.size > 0) {
                runtime.subscribers = mergeRuntimeSubscribers(
                    runtime.subscribers,
                    pendingSubscribers,
                );
            }

            session.onEvent((event) => {
                this.handleRuntimeEvent(runtime, event);
            });
            session.onExit((error) => {
                this.handleRuntimeExit(runtime, error);
            });

            await this.throwIfRuntimeInitializationCancelled({
                initializationState,
                session,
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
                    session,
                    cleanupWorkspace: cleanupWorkspaceOnFailure,
                });
            }
            throw error;
        }
    }

    private async throwIfRuntimeInitializationCancelled(params: {
        initializationState: PendingRuntimeInitialization;
        session: RuntimeKindSession | null;
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

        if (params.session) {
            await this.stopSessionSafely(
                params.session,
                "canceled runtime initialization",
            );
        }
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
        if (pendingInitialization.session) {
            void this.stopSessionSafely(
                pendingInitialization.session,
                "pending runtime initialization cancellation",
            );
        }
        return pendingInitialization;
    }

    private async stopSessionSafely(
        session: RuntimeKindSession,
        reason: string,
    ): Promise<void> {
        try {
            await session.stop();
        } catch (error) {
            console.error(
                `[agentchat-server] failed to stop runtime session during ${reason}`,
                error,
            );
        }
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
        session: RuntimeKindSession | null;
        cleanupWorkspace: boolean;
    }): Promise<void> {
        if (params.session) {
            await this.stopSessionSafely(
                params.session,
                "failed runtime initialization cleanup",
            );
        }
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

    private beginSubscriberResolution(subscriberId: string): void {
        this.pendingSubscriberResolutions.set(
            subscriberId,
            (this.pendingSubscriberResolutions.get(subscriberId) ?? 0) + 1,
        );
    }

    private finishSubscriberResolution(subscriberId: string): void {
        const remaining =
            (this.pendingSubscriberResolutions.get(subscriberId) ?? 1) - 1;
        if (remaining > 0) {
            this.pendingSubscriberResolutions.set(subscriberId, remaining);
        } else {
            this.pendingSubscriberResolutions.delete(subscriberId);
        }
        this.maybeClearClosedSubscriber(subscriberId);
    }

    private maybeClearClosedSubscriber(subscriberId: string): void {
        if (!this.closedSubscribers.has(subscriberId)) {
            return;
        }
        if (this.pendingSubscriberResolutions.has(subscriberId)) {
            return;
        }
        if (this.hasTrackedSubscriber(subscriberId)) {
            return;
        }
        this.closedSubscribers.delete(subscriberId);
    }

    private hasTrackedSubscriber(subscriberId: string): boolean {
        for (const runtime of this.runtimes.values()) {
            if (runtime.subscribers.has(subscriberId)) {
                return true;
            }
        }
        for (const subscribers of this.pendingSubscriptions.values()) {
            if (subscribers.has(subscriberId)) {
                return true;
            }
        }
        return false;
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

        await this.persistence
            .recoverStaleRun({
                chatId: persistedState.chatId,
                userId: params.userId,
                agentId: params.agentId,
                conversationLocalId: params.conversationId,
                externalRunId: persistedBinding.activeRunId,
                completedAt: this.nextPersistenceTimestamp(),
                errorMessage:
                    "This run was orphaned after the runtime disconnected before completion.",
                workspaceMode: persistedBinding.workspaceMode,
                workspaceRootPath: persistedBinding.workspaceRootPath,
                workspaceCwd: persistedBinding.workspaceCwd,
            })
            .catch(async (error) => {
                console.error(
                    "[agentchat-server] failed to recover orphaned active run; clearing stale binding",
                    error,
                );
                try {
                    const staleBindingUpdatedAt =
                        this.nextPersistenceTimestamp();
                    await this.persistence.runtimeBinding({
                        chatId: persistedState.chatId,
                        userId: params.userId,
                        agentId: params.agentId,
                        conversationLocalId: params.conversationId,
                        provider: persistedBinding.provider,
                        status: "errored",
                        providerConversationId: null,
                        activeRunId: null,
                        lastError:
                            error instanceof Error
                                ? error.message
                                : "Failed to recover orphaned active run.",
                        lastEventAt: staleBindingUpdatedAt,
                        expiresAt: null,
                        workspaceMode: persistedBinding.workspaceMode,
                        workspaceRootPath: persistedBinding.workspaceRootPath,
                        workspaceCwd: persistedBinding.workspaceCwd,
                        updatedAt: staleBindingUpdatedAt,
                    });
                } catch (bindingError) {
                    console.error(
                        "[agentchat-server] failed to clear stale orphaned binding",
                        bindingError,
                    );
                }
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
        session: RuntimeKindSession;
        provider: ProviderConfig;
        bindingProviderId: string | null;
        bindingThreadId: string | null;
        modelId: string;
        cwd: string;
    }): Promise<
        RuntimeKindLifecycleResult & { threadId: string; isNew: boolean }
    > {
        return await params.session.openThread({
            bindingProviderId: params.bindingProviderId,
            bindingThreadId: params.bindingThreadId,
            providerId: params.provider.id,
            modelId: params.modelId,
            cwd: params.cwd,
        });
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
                    workspaceMode: runtime.agent.workspaceMode,
                    workspaceRootPath: runtime.agent.rootPath,
                    workspaceCwd: runtime.cwd,
                    completedAt: this.nextPersistenceTimestamp(),
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

        const runtimeErroredAt = this.nextPersistenceTimestamp();
        void this.persistence
            .runtimeBinding({
                chatId: runtime.chatId,
                userId: runtime.userId,
                agentId: runtime.agentId,
                conversationLocalId: runtime.conversationId,
                provider: runtime.provider.id,
                status: "errored",
                providerConversationId: runtime.threadId,
                activeRunId: null,
                lastError: error.message,
                lastEventAt: runtimeErroredAt,
                expiresAt: null,
                workspaceMode: runtime.agent.workspaceMode,
                workspaceRootPath: runtime.agent.rootPath,
                workspaceCwd: runtime.cwd,
                updatedAt: runtimeErroredAt,
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

    private handleRuntimeEvent(
        runtime: ConversationRuntime,
        event: RuntimeKindEvent,
    ): void {
        const activeTurn = runtime.activeTurn;
        if (!activeTurn) {
            return;
        }
        if (activeTurn.pendingRunStartPersistence) {
            activeTurn.queuedEvents.push(event);
            return;
        }

        if (event.type === "provider_identity_updated") {
            runtime.threadId = event.threadId;
            const updatedAt = this.nextPersistenceTimestamp();
            void this.persistence
                .runtimeBinding({
                    chatId: runtime.chatId,
                    userId: runtime.userId,
                    agentId: runtime.agentId,
                    conversationLocalId: runtime.conversationId,
                    provider: runtime.provider.id,
                    status: "active",
                    providerConversationId: runtime.threadId,
                    activeRunId: activeTurn.runId,
                    lastError: null,
                    lastEventAt: updatedAt,
                    expiresAt: null,
                    workspaceMode: runtime.agent.workspaceMode,
                    workspaceRootPath: runtime.agent.rootPath,
                    workspaceCwd: runtime.cwd,
                    updatedAt,
                })
                .catch((error) => {
                    console.error(
                        "[agentchat-server] failed to persist runtime identity update",
                        error,
                    );
                });
            for (const providerEvent of event.providerEvents ?? []) {
                this.recordProviderEvent(runtime, activeTurn, providerEvent);
            }
            return;
        }

        if (event.type === "provider_event") {
            this.recordProviderEvent(runtime, activeTurn, event.event);
            return;
        }

        if (event.type === "reasoning") {
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

            const delta = isFirstStatusChunk ? event.text : `\n${event.text}`;

            if (isFirstStatusChunk) {
                activeTurn.currentMessageKind = "assistant_status";

                this.emitToSubscribers(
                    runtime,
                    createRuntimeServerEvent(runtime, "message.started", {
                        runId: activeTurn.runId,
                        messageId: activeTurn.currentMessageId,
                        messageIndex: activeTurn.currentMessageIndex,
                        kind: activeTurn.currentMessageKind,
                        content: event.text,
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
                activeTurn.text = event.text;
                activeTurn.lastPersistedContent = event.text;
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
                    createdAt: this.nextPersistenceTimestamp(),
                })
                .catch((error) => {
                    console.error(
                        "[agentchat-server] failed to persist agent reasoning status",
                        error,
                    );
                });
            return;
        }

        if (event.type === "assistant_delta") {
            if (activeTurn.currentMessageKind === "assistant_status") {
                this.transitionStatusMessageToAssistantOutput(
                    runtime,
                    activeTurn,
                );
            }

            activeTurn.text += event.delta;
            this.emitToSubscribers(
                runtime,
                createRuntimeServerEvent(runtime, "message.delta", {
                    messageId: activeTurn.currentMessageId,
                    delta: event.delta,
                    content: activeTurn.text,
                }),
            );
            this.scheduleMessageDeltaPersistence(runtime, activeTurn);
            return;
        }

        if (event.type === "turn_aborted") {
            void this.finalizeTurn(runtime, activeTurn, {
                finalStatus: "interrupted",
            });
            return;
        }

        if (event.type !== "turn_completed") {
            return;
        }

        if (event.status === "completed") {
            void this.finalizeTurn(runtime, activeTurn, {
                finalStatus: "completed",
            });
            return;
        }

        if (event.status === "interrupted") {
            void this.finalizeTurn(runtime, activeTurn, {
                finalStatus: "interrupted",
            });
            return;
        }

        void this.finalizeTurn(runtime, activeTurn, {
            finalStatus: "errored",
            errorMessage: event.errorMessage ?? "Runtime run failed",
        });
    }

    private recordProviderEvent(
        runtime: ConversationRuntime,
        activeTurn: ActiveTurn,
        providerEvent: RuntimeProviderEvent,
    ): void {
        const sequence = activeTurn.nextSequence++;
        const occurredAt = this.nextPersistenceTimestamp();
        const metadataJson = JSON.stringify(providerEvent.metadata);

        void this.persistence
            .providerEvent({
                chatId: runtime.chatId,
                userId: activeTurn.userId,
                agentId: runtime.agentId,
                conversationLocalId: runtime.conversationId,
                externalRunId: activeTurn.runId,
                sequence,
                provider: runtime.provider.id,
                providerKind: providerEvent.providerKind,
                eventId: providerEvent.id,
                eventType: providerEvent.eventType,
                phase: providerEvent.phase,
                summary: providerEvent.summary,
                stable: providerEvent.stable,
                metadataJson,
                occurredAt,
            })
            .catch((error) => {
                console.error(
                    "[agentchat-server] failed to persist provider event",
                    error,
                );
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
        const createdAt = this.nextPersistenceTimestamp();

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
        const completedAt = this.nextPersistenceTimestamp();

        if (params.finalStatus === "completed") {
            const runCompletedPersistence = this.persistence.runCompleted({
                chatId: runtime.chatId,
                userId: activeTurn.userId,
                agentId: runtime.agentId,
                conversationLocalId: runtime.conversationId,
                assistantMessageLocalId: activeTurn.currentMessageId,
                externalRunId: activeTurn.runId,
                sequence,
                content: activeTurn.text,
                workspaceMode: runtime.agent.workspaceMode,
                workspaceRootPath: runtime.agent.rootPath,
                workspaceCwd: runtime.cwd,
                completedAt,
            });
            void runCompletedPersistence
                .then(() => this.persistIdleRuntimeBinding(runtime))
                .catch((error) => {
                    console.error(
                        "[agentchat-server] failed to persist completed run finalization",
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
            const runInterruptedPersistence = this.persistence.runInterrupted({
                chatId: runtime.chatId,
                userId: activeTurn.userId,
                agentId: runtime.agentId,
                conversationLocalId: runtime.conversationId,
                assistantMessageLocalId: activeTurn.currentMessageId,
                externalRunId: activeTurn.runId,
                sequence,
                content: activeTurn.text,
                workspaceMode: runtime.agent.workspaceMode,
                workspaceRootPath: runtime.agent.rootPath,
                workspaceCwd: runtime.cwd,
                completedAt,
            });
            void runInterruptedPersistence
                .then(() => this.persistIdleRuntimeBinding(runtime))
                .catch((error) => {
                    console.error(
                        "[agentchat-server] failed to persist interrupted run finalization",
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

        const runFailedPersistence = this.persistence.runFailed({
            chatId: runtime.chatId,
            userId: activeTurn.userId,
            agentId: runtime.agentId,
            conversationLocalId: runtime.conversationId,
            assistantMessageLocalId: activeTurn.currentMessageId,
            externalRunId: activeTurn.runId,
            sequence,
            content: activeTurn.text,
            workspaceMode: runtime.agent.workspaceMode,
            workspaceRootPath: runtime.agent.rootPath,
            workspaceCwd: runtime.cwd,
            completedAt,
            errorMessage,
        });
        void runFailedPersistence
            .then(() => this.persistIdleRuntimeBinding(runtime))
            .catch((error) => {
                console.error(
                    "[agentchat-server] failed to persist failed run finalization",
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

    private async persistIdleRuntimeBinding(
        runtime: ConversationRuntime,
    ): Promise<void> {
        if (this.runtimes.get(runtime.key) !== runtime || runtime.activeTurn) {
            return;
        }

        const updatedAt = this.nextPersistenceTimestamp();
        await this.persistence.runtimeBinding({
            chatId: runtime.chatId,
            userId: runtime.userId,
            agentId: runtime.agentId,
            conversationLocalId: runtime.conversationId,
            provider: runtime.provider.id,
            status: "idle",
            providerConversationId: runtime.threadId,
            activeRunId: null,
            lastError: null,
            lastEventAt: updatedAt,
            expiresAt: null,
            workspaceMode: runtime.agent.workspaceMode,
            workspaceRootPath: runtime.agent.rootPath,
            workspaceCwd: runtime.cwd,
            updatedAt,
        });
    }

    private scheduleIdleExpiration(runtime: ConversationRuntime): void {
        if (runtime.idleTimer) {
            clearTimeout(runtime.idleTimer);
        }

        const idleTimer = setTimeout(() => {
            void (async () => {
                if (
                    this.runtimes.get(runtime.key) !== runtime ||
                    runtime.idleTimer !== idleTimer ||
                    runtime.activeTurn
                ) {
                    return;
                }
                runtime.idleTimer = null;

                const expiredAt = this.nextPersistenceTimestamp();
                void this.persistence
                    .runtimeBinding({
                        chatId: runtime.chatId,
                        userId: runtime.userId,
                        agentId: runtime.agentId,
                        conversationLocalId: runtime.conversationId,
                        provider: runtime.provider.id,
                        status: "expired",
                        providerConversationId: runtime.threadId,
                        activeRunId: null,
                        lastError: null,
                        lastEventAt: expiredAt,
                        expiresAt: expiredAt,
                        workspaceMode: runtime.agent.workspaceMode,
                        workspaceRootPath: runtime.agent.rootPath,
                        workspaceCwd: runtime.cwd,
                        updatedAt: expiredAt,
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
                this.runtimes.delete(runtime.key);
                await this.stopSessionSafely(
                    runtime.session,
                    "idle runtime expiration",
                );
            })();
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
            createdAt: this.nextPersistenceTimestamp(),
        });
    }

    private async disposeRuntime(
        runtime: ConversationRuntime,
        params: {
            removeFromMap: boolean;
            reason: Error;
        },
    ): Promise<void> {
        if (runtime.idleTimer) {
            clearTimeout(runtime.idleTimer);
            runtime.idleTimer = null;
        }

        if (runtime.activeTurn) {
            this.cancelPendingMessageDelta(runtime.activeTurn);
            runtime.activeTurn.reject(params.reason);
            runtime.activeTurn = null;
        }

        if (
            params.removeFromMap &&
            this.runtimes.get(runtime.key) === runtime
        ) {
            this.runtimes.delete(runtime.key);
        }
        await this.stopSessionSafely(runtime.session, "runtime disposal");
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

    const resolvedProvider = getProviderConfig(config, agent.defaultProviderId);
    const provider = resolvedProvider?.enabled ? resolvedProvider : null;
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
    runtimeKind: RuntimeKind,
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

    if (runtime.provider.kind !== resources.provider.kind) {
        return true;
    }

    return runtimeKind.shouldRecycleProvider(
        runtime.provider,
        resources.provider,
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
): boolean {
    if (
        desired.workspaceMode === "shared" &&
        binding.workspaceMode === undefined &&
        binding.workspaceRootPath === undefined &&
        binding.workspaceCwd === undefined
    ) {
        return true;
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

function getPersistedProviderConversationId(
    binding: PersistedRuntimeBinding,
): string | null {
    return binding.providerConversationId === undefined
        ? (binding.providerThreadId ?? null)
        : binding.providerConversationId;
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
