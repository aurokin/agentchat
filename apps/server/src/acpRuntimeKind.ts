import type {
    AcpProviderConfig,
    AgentConfig,
    ProviderConfig,
} from "./config.ts";
import {
    AcpProtocolClient,
    createAcpProviderEvent,
    type AcpInitializeResult,
} from "./acpProtocol.ts";
import {
    JsonRpcStdioClient,
    ManagedRuntimeProcess,
    type JsonlParseError,
    type RuntimeProcessLike,
} from "./runtimeTransport.ts";
import type {
    ProviderModelCatalogEntry,
    RuntimeKind,
    RuntimeKindCapabilities,
    RuntimeKindEvent,
    RuntimeKindLifecycleResult,
    RuntimeKindSession,
    RuntimeOpenThreadParams,
    RuntimeProviderEventMetadata,
    RuntimeStartTurnParams,
} from "./runtimeKind.ts";

export const ACP_RUNTIME_CAPABILITIES = {
    lifecycleModel: "persistent-session",
    modelCatalogSource: "configured",
    resumability: ["session-id"],
    cancellation: ["cooperative-command", "process-signal"],
    approval: "auto-deny",
    artifacts: ["lifecycle", "tool", "plan", "diagnostic"],
    workspace: ["shared-root", "copy-on-conversation"],
} as const satisfies RuntimeKindCapabilities;

const DEFAULT_ACP_MODELS: ProviderModelCatalogEntry[] = [
    {
        id: "default",
        label: "Default",
        supportsReasoning: false,
        variants: [{ id: "default", label: "Default" }],
        defaultVariantId: "default",
        providerMetadata: { source: "static" },
    },
];

type CreateAcpProcess = (params: {
    command: string;
    args: string[];
    cwd: string;
    env: NodeJS.ProcessEnv;
    stopTimeoutMs?: number;
    onStderr: (chunk: string) => void;
}) => RuntimeProcessLike;

function invariant(condition: unknown, message: string): asserts condition {
    if (!condition) {
        throw new Error(message);
    }
}

function assertAcpProvider(
    provider: ProviderConfig,
): asserts provider is AcpProviderConfig {
    invariant(
        provider.kind === "acp",
        `ACP runtime received provider kind '${provider.kind}'.`,
    );
}

function configuredModels(
    provider: AcpProviderConfig,
): ProviderModelCatalogEntry[] | null {
    const models = provider.models
        .filter((model) => model.enabled)
        .map((model) => ({
            id: model.id,
            label: model.label,
            supportsReasoning: model.supportsReasoning,
            variants: model.variants
                .filter((variant) => variant.enabled)
                .map((variant) => ({
                    id: variant.id,
                    label: variant.label,
                })),
            providerMetadata: { source: "configured" },
        }));
    return models.length > 0 ? models : null;
}

function sortRecordEntries(record: Record<string, string>) {
    return Object.fromEntries(
        Object.entries(record).sort(([left], [right]) =>
            left.localeCompare(right),
        ),
    );
}

function providerRuntimeFingerprint(provider: AcpProviderConfig): string {
    return JSON.stringify({
        command: provider.acp.command,
        args: provider.acp.args,
        baseEnv: sortRecordEntries(provider.acp.baseEnv),
        cwd: provider.acp.cwd ?? null,
        mcpServers: provider.acp.mcpServers,
        permissionMode: provider.acp.permissionMode,
        timeoutMs: provider.acp.timeoutMs ?? null,
    });
}

function sanitizeMetadata(
    value: unknown,
    depth = 0,
): RuntimeProviderEventMetadata {
    if (value === null) {
        return null;
    }
    if (
        typeof value === "number" ||
        typeof value === "boolean" ||
        typeof value === "string"
    ) {
        return typeof value === "string" && value.length > 16_000
            ? `${value.slice(0, 16_000)}... [truncated]`
            : value;
    }
    if (depth >= 4) {
        return "[truncated]";
    }
    if (Array.isArray(value)) {
        return value
            .slice(0, 50)
            .map((item) => sanitizeMetadata(item, depth + 1));
    }
    if (typeof value !== "object") {
        return String(value);
    }

    const metadata: Record<string, RuntimeProviderEventMetadata> = {};
    for (const [key, childValue] of Object.entries(value).slice(0, 50)) {
        metadata[key] = sanitizeMetadata(childValue, depth + 1);
    }
    return metadata;
}

function acpProviderEvent(params: {
    eventType: string;
    phase: Parameters<typeof createAcpProviderEvent>[0]["phase"];
    summary: string;
    stable?: boolean;
    sessionId?: string;
    metadata?: Record<string, RuntimeProviderEventMetadata>;
}) {
    return createAcpProviderEvent({
        stable: params.stable ?? true,
        ...params,
    });
}

class AcpRuntimeKindSession implements RuntimeKindSession {
    private readonly eventHandlers = new Set<
        (event: RuntimeKindEvent) => void
    >();
    private readonly exitHandlers = new Set<(error: Error) => void>();
    private readonly stderrChunks: string[] = [];
    private runtimeProcess: RuntimeProcessLike | null = null;
    private jsonRpcClient: JsonRpcStdioClient | null = null;
    private client: AcpProtocolClient | null = null;
    private initializeResult: AcpInitializeResult | null = null;
    private currentSessionId: string | null = null;
    private activeTurnId: string | null = null;
    private terminalEventEmitted = false;
    private stopping = false;
    private stoppingForInterrupt = false;
    private suppressPromptRejection = false;
    private turnTimer: ReturnType<typeof setTimeout> | null = null;

    constructor(
        private readonly provider: AcpProviderConfig,
        private readonly agent: AgentConfig,
        private readonly createProcess: CreateAcpProcess,
    ) {}

    async initialize(): Promise<RuntimeKindLifecycleResult> {
        if (this.client) {
            return {};
        }

        const cwd = this.provider.acp.cwd ?? this.agent.rootPath;
        this.runtimeProcess = this.createProcess({
            command: this.provider.acp.command,
            args: this.provider.acp.args,
            cwd,
            env: {
                ...process.env,
                ...this.provider.acp.baseEnv,
            },
            stopTimeoutMs: this.provider.acp.timeoutMs,
            onStderr: (chunk) => {
                this.stderrChunks.push(chunk);
            },
        });
        this.jsonRpcClient = new JsonRpcStdioClient({
            process: this.runtimeProcess,
            label: "ACP runtime",
            onParseError: (error) => this.handleParseError(error),
        });
        this.jsonRpcClient.onExit((error) => this.handleProcessExit(error));
        this.client = new AcpProtocolClient({
            transport: this.jsonRpcClient,
            permissionMode: this.provider.acp.permissionMode,
        });
        this.client.onEvent((event) => {
            if (event.type === "runtime_event") {
                this.handleRuntimeEvent(event.event);
            }
        });

        this.initializeResult = await this.client.initialize();
        return {
            providerEvents: [
                acpProviderEvent({
                    eventType: "acp.initialized",
                    phase: "initialization",
                    summary: "ACP runtime initialized.",
                    metadata: {
                        lifecycleModel: "persistent-session",
                        capabilities: sanitizeMetadata(
                            this.initializeResult.agentCapabilities,
                        ),
                        agentInfo: sanitizeMetadata(
                            this.initializeResult.agentInfo ?? null,
                        ),
                    },
                }),
            ],
        };
    }

    async openThread(
        params: RuntimeOpenThreadParams,
    ): Promise<
        RuntimeKindLifecycleResult & { threadId: string; isNew: boolean }
    > {
        const client = this.requireClient();
        const persistedSessionId =
            params.bindingProviderId === params.providerId
                ? params.bindingThreadId
                : null;
        const cwd = this.provider.acp.cwd ?? params.cwd;

        if (persistedSessionId && client.capabilities?.loadSession) {
            try {
                await client.loadSession({
                    sessionId: persistedSessionId,
                    cwd,
                    mcpServers: this.provider.acp.mcpServers,
                });
                this.currentSessionId = persistedSessionId;
                return {
                    threadId: persistedSessionId,
                    isNew: false,
                    providerEvents: [
                        acpProviderEvent({
                            eventType: "acp.session.loaded",
                            phase: "thread",
                            summary: "ACP session loaded from runtime binding.",
                            sessionId: persistedSessionId,
                            metadata: {
                                requestedModel: params.modelId,
                                cwd,
                            },
                        }),
                    ],
                };
            } catch (error) {
                const message =
                    error instanceof Error ? error.message : String(error);
                const freshSession = await this.createFreshSession({
                    client,
                    cwd,
                    requestedModel: params.modelId,
                    previousSessionId: persistedSessionId,
                    loadFailureMessage: message,
                });
                return freshSession;
            }
        }

        return await this.createFreshSession({
            client,
            cwd,
            requestedModel: params.modelId,
            previousSessionId: persistedSessionId,
        });
    }

    private async createFreshSession(params: {
        client: AcpProtocolClient;
        cwd: string;
        requestedModel: string;
        previousSessionId: string | null;
        loadFailureMessage?: string;
    }): Promise<
        RuntimeKindLifecycleResult & { threadId: string; isNew: boolean }
    > {
        const sessionId = await params.client.newSession({
            cwd: params.cwd,
            mcpServers: this.provider.acp.mcpServers,
        });
        this.currentSessionId = sessionId;
        const providerEvents =
            params.previousSessionId && params.loadFailureMessage
                ? [
                      acpProviderEvent({
                          eventType: "acp.session.load-failed",
                          phase: "thread",
                          summary:
                              "ACP session load failed; created a fresh session.",
                          sessionId,
                          metadata: {
                              previousSessionId: params.previousSessionId,
                              requestedModel: params.requestedModel,
                              cwd: params.cwd,
                              errorMessage: params.loadFailureMessage,
                          },
                      }),
                  ]
                : [
                      acpProviderEvent({
                          eventType: params.previousSessionId
                              ? "acp.session.recreated"
                              : "acp.session.created",
                          phase: "thread",
                          summary: params.previousSessionId
                              ? "ACP agent does not advertise loadSession; created a fresh session."
                              : "ACP session created.",
                          sessionId,
                          metadata: {
                              previousSessionId: params.previousSessionId,
                              requestedModel: params.requestedModel,
                              cwd: params.cwd,
                          },
                      }),
                  ];
        return {
            threadId: sessionId,
            isNew: true,
            providerEvents,
        };
    }

    async startTurn(
        params: RuntimeStartTurnParams,
    ): Promise<RuntimeKindLifecycleResult & { turnId: string }> {
        if (this.activeTurnId && !this.terminalEventEmitted) {
            throw new Error("ACP turn already in progress.");
        }
        const client = this.requireClient();
        invariant(this.currentSessionId, "ACP session has not been opened.");

        const turnId = crypto.randomUUID();
        this.activeTurnId = turnId;
        this.terminalEventEmitted = false;
        this.stoppingForInterrupt = false;
        this.suppressPromptRejection = false;
        this.scheduleTurnTimeout(turnId);

        void client
            .prompt({
                sessionId: this.currentSessionId,
                text: params.inputText,
            })
            .then((outcome) => {
                for (const event of outcome.events) {
                    this.handleRuntimeEvent(event);
                }
            })
            .catch((error) => {
                if (this.terminalEventEmitted || this.suppressPromptRejection) {
                    return;
                }
                const message =
                    error instanceof Error ? error.message : String(error);
                this.emitTerminalEvent({
                    status: this.stoppingForInterrupt
                        ? "interrupted"
                        : "errored",
                    errorMessage: this.stoppingForInterrupt
                        ? undefined
                        : message,
                    providerEvent: acpProviderEvent({
                        eventType: this.stoppingForInterrupt
                            ? "acp.session.prompt.cancelled"
                            : "acp.session.prompt.failed",
                        phase: "completion",
                        summary: this.stoppingForInterrupt
                            ? "ACP prompt interrupted."
                            : "ACP prompt failed.",
                        sessionId: this.currentSessionId ?? undefined,
                        metadata: {
                            turnId,
                            errorMessage: message,
                        },
                    }),
                });
            });

        return {
            turnId,
            providerEvents: [
                acpProviderEvent({
                    eventType: "acp.session.prompt.started",
                    phase: "turn",
                    summary: "ACP prompt started.",
                    sessionId: this.currentSessionId,
                    metadata: {
                        turnId,
                        threadId: params.threadId,
                        requestedModel: params.modelId,
                        requestedVariant: params.variantId,
                    },
                }),
            ],
        };
    }

    async interruptTurn(): Promise<void> {
        if (!this.activeTurnId || this.terminalEventEmitted) {
            return;
        }
        const client = this.requireClient();
        invariant(this.currentSessionId, "ACP session has not been opened.");

        this.stoppingForInterrupt = true;
        client.cancel({ sessionId: this.currentSessionId });
        this.emit({
            type: "provider_event",
            event: acpProviderEvent({
                eventType: "acp.session.cancel.sent",
                phase: "turn",
                summary: "ACP session cancel sent.",
                sessionId: this.currentSessionId,
                metadata: {
                    turnId: this.activeTurnId,
                },
            }),
        });
        this.scheduleCancelFallback(this.activeTurnId);
    }

    onEvent(handler: (event: RuntimeKindEvent) => void): void {
        this.eventHandlers.add(handler);
    }

    onExit(handler: (error: Error) => void): void {
        this.exitHandlers.add(handler);
    }

    async stop(): Promise<void> {
        this.stopping = true;
        this.clearTurnTimer();
        if (!this.runtimeProcess || this.runtimeProcess.hasExited) {
            return;
        }
        await this.runtimeProcess.stop();
    }

    private requireClient(): AcpProtocolClient {
        invariant(this.client, "ACP runtime has not been initialized.");
        return this.client;
    }

    private scheduleTurnTimeout(turnId: string): void {
        const timeoutMs = this.provider.acp.timeoutMs;
        if (!timeoutMs) {
            return;
        }

        this.turnTimer = setTimeout(() => {
            if (
                this.activeTurnId !== turnId ||
                this.terminalEventEmitted ||
                !this.currentSessionId
            ) {
                return;
            }
            this.turnTimer = null;
            this.suppressPromptRejection = true;
            this.client?.cancel({ sessionId: this.currentSessionId });
            void this.stopRuntimeProcessForTerminalEvent({
                status: "errored",
                errorMessage: `ACP prompt timed out after ${timeoutMs}ms.`,
                providerEvent: acpProviderEvent({
                    eventType: "acp.session.prompt.timed-out",
                    phase: "completion",
                    summary: "ACP prompt timed out.",
                    sessionId: this.currentSessionId ?? undefined,
                    metadata: {
                        turnId,
                        timeoutMs,
                    },
                }),
            });
        }, timeoutMs);
    }

    private scheduleCancelFallback(turnId: string): void {
        this.clearTurnTimer();
        const timeoutMs = this.provider.acp.timeoutMs ?? 5_000;
        this.turnTimer = setTimeout(() => {
            if (this.activeTurnId !== turnId || this.terminalEventEmitted) {
                return;
            }
            this.turnTimer = null;
            void this.stopRuntimeProcessForTerminalEvent({
                status: "interrupted",
                providerEvent: acpProviderEvent({
                    eventType: "acp.session.cancel.fallback",
                    phase: "completion",
                    summary:
                        "ACP prompt did not settle after cancel; runtime process stopped.",
                    sessionId: this.currentSessionId ?? undefined,
                    metadata: {
                        turnId,
                        timeoutMs,
                    },
                }),
            });
        }, timeoutMs);
    }

    private clearTurnTimer(): void {
        if (!this.turnTimer) {
            return;
        }
        clearTimeout(this.turnTimer);
        this.turnTimer = null;
    }

    private handleRuntimeEvent(event: RuntimeKindEvent): void {
        if (event.type === "turn_aborted") {
            this.emitTerminalEvent({
                status: "interrupted",
                providerEvent: acpProviderEvent({
                    eventType: "acp.session.prompt.cancelled",
                    phase: "completion",
                    summary: "ACP prompt cancelled.",
                    sessionId: this.currentSessionId ?? undefined,
                    metadata: {
                        turnId: this.activeTurnId,
                    },
                }),
            });
            return;
        }

        if (event.type === "turn_completed") {
            this.emitTerminalEvent({
                status: event.status,
                errorMessage: event.errorMessage,
                providerEvent: acpProviderEvent({
                    eventType: "acp.session.prompt.finalized",
                    phase: "completion",
                    summary: "ACP prompt finalized.",
                    sessionId: this.currentSessionId ?? undefined,
                    metadata: {
                        turnId: this.activeTurnId,
                        status: event.status,
                        errorMessage: event.errorMessage ?? null,
                    },
                }),
            });
            return;
        }

        this.emit(event);
    }

    private emitTerminalEvent(params: {
        status: "completed" | "interrupted" | "errored";
        errorMessage?: string;
        providerEvent: ReturnType<typeof acpProviderEvent>;
    }): void {
        if (this.terminalEventEmitted) {
            return;
        }

        this.terminalEventEmitted = true;
        this.clearTurnTimer();
        this.emit({ type: "provider_event", event: params.providerEvent });
        this.emit({
            type: "turn_completed",
            status: params.status,
            errorMessage: params.errorMessage,
        });
        this.activeTurnId = null;
        this.stoppingForInterrupt = false;
        this.suppressPromptRejection = false;
    }

    private async stopRuntimeProcessForTerminalEvent(params: {
        status: "completed" | "interrupted" | "errored";
        errorMessage?: string;
        providerEvent: ReturnType<typeof acpProviderEvent>;
    }): Promise<void> {
        try {
            await this.runtimeProcess?.stop();
        } catch (error) {
            if (!params.errorMessage) {
                params.errorMessage =
                    error instanceof Error ? error.message : String(error);
            }
        } finally {
            this.emitTerminalEvent(params);
        }
    }

    private handleParseError(error: JsonlParseError): void {
        this.emit({
            type: "provider_event",
            event: acpProviderEvent({
                eventType: "acp.parse-error",
                phase: "diagnostic",
                summary: "ACP runtime emitted malformed JSON-RPC.",
                stable: false,
                metadata: {
                    line: error.line.slice(0, 16_000),
                    error:
                        error.error instanceof Error
                            ? error.error.message
                            : String(error.error),
                },
            }),
        });
    }

    private handleProcessExit(error: Error): void {
        if (this.stopping) {
            return;
        }
        if (this.activeTurnId && !this.terminalEventEmitted) {
            const message = this.stderrChunks.join("").trim() || error.message;
            this.emitTerminalEvent({
                status: this.stoppingForInterrupt ? "interrupted" : "errored",
                errorMessage: this.stoppingForInterrupt ? undefined : message,
                providerEvent: acpProviderEvent({
                    eventType: this.stoppingForInterrupt
                        ? "acp.process.interrupted"
                        : "acp.process.exited",
                    phase: "completion",
                    summary: this.stoppingForInterrupt
                        ? "ACP runtime stopped during interrupt."
                        : "ACP runtime exited during prompt.",
                    sessionId: this.currentSessionId ?? undefined,
                    metadata: {
                        turnId: this.activeTurnId,
                        errorMessage: message,
                    },
                }),
            });
            return;
        }

        for (const handler of this.exitHandlers) {
            handler(error);
        }
    }

    private emit(event: RuntimeKindEvent): void {
        for (const handler of this.eventHandlers) {
            handler(event);
        }
    }
}

export class AcpRuntimeKind implements RuntimeKind {
    readonly kind = "acp";
    readonly capabilities = ACP_RUNTIME_CAPABILITIES;
    private readonly createRuntimeProcess: CreateAcpProcess;

    constructor(
        params: {
            createRuntimeProcess?: CreateAcpProcess;
        } = {},
    ) {
        this.createRuntimeProcess =
            params.createRuntimeProcess ??
            ((processParams) =>
                new ManagedRuntimeProcess({
                    ...processParams,
                    label: "ACP runtime",
                    onStderr: processParams.onStderr,
                }));
    }

    createSession(params: {
        provider: ProviderConfig;
        agent: AgentConfig;
    }): RuntimeKindSession {
        assertAcpProvider(params.provider);
        return new AcpRuntimeKindSession(
            params.provider,
            params.agent,
            this.createRuntimeProcess,
        );
    }

    shouldRecycleProvider(
        current: ProviderConfig,
        next: ProviderConfig,
    ): boolean {
        assertAcpProvider(current);
        assertAcpProvider(next);
        return (
            providerRuntimeFingerprint(current) !==
            providerRuntimeFingerprint(next)
        );
    }

    async listModels(params: {
        provider: ProviderConfig;
        agent: AgentConfig;
    }): Promise<ProviderModelCatalogEntry[]> {
        assertAcpProvider(params.provider);
        return configuredModels(params.provider) ?? DEFAULT_ACP_MODELS;
    }
}
