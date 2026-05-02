import type {
    AgentConfig,
    ClaudeCodeProviderConfig,
    ProviderConfig,
} from "./config.ts";
import {
    attachJsonlParser,
    ManagedRuntimeProcess,
    type JsonlParseError,
    type RuntimeProcessExit,
    type RuntimeProcessStopPolicy,
} from "./runtimeTransport.ts";
import type {
    ProviderModelCatalogEntry,
    RuntimeKind,
    RuntimeKindCapabilities,
    RuntimeKindEvent,
    RuntimeKindLifecycleResult,
    RuntimeKindSession,
    RuntimeOpenThreadParams,
    RuntimeProviderEvent,
    RuntimeProviderEventMetadata,
    RuntimeStartTurnParams,
} from "./runtimeKind.ts";

export const CLAUDE_CODE_RUNTIME_CAPABILITIES = {
    lifecycleModel: "per-turn-subprocess",
    modelCatalogSource: "static",
    resumability: ["session-id", "provider-storage"],
    cancellation: ["process-signal"],
    approval: "auto-approve",
    artifacts: ["lifecycle", "usage", "tool", "command", "diagnostic"],
    workspace: ["shared-root", "copy-on-conversation"],
} as const satisfies RuntimeKindCapabilities;

const DEFAULT_CLAUDE_CODE_MODELS: ProviderModelCatalogEntry[] = [
    {
        id: "sonnet",
        label: "Claude Sonnet",
        supportsReasoning: false,
        variants: [
            { id: "default", label: "Default" },
            { id: "plan", label: "Plan" },
        ],
        defaultVariantId: "default",
        providerMetadata: { source: "static" },
    },
    {
        id: "opus",
        label: "Claude Opus",
        supportsReasoning: false,
        variants: [
            { id: "default", label: "Default" },
            { id: "plan", label: "Plan" },
        ],
        defaultVariantId: "default",
        providerMetadata: { source: "static" },
    },
];

const CLAUDE_PENDING_THREAD_PREFIX = "claude-pending:";
const CLAUDE_CODE_STOP_POLICY = {
    gracefulSignal: "SIGINT",
    forceSignal: "SIGKILL",
} as const satisfies Required<RuntimeProcessStopPolicy>;

type CreateClaudeCodeProcess = (params: {
    command: string;
    args: string[];
    cwd: string;
    env: NodeJS.ProcessEnv;
    stopTimeoutMs?: number;
    stopPolicy?: RuntimeProcessStopPolicy;
    onStderr: (chunk: string) => void;
}) => ManagedRuntimeProcess;

function invariant(condition: unknown, message: string): asserts condition {
    if (!condition) {
        throw new Error(message);
    }
}

function isClaudePendingThreadId(threadId: string | null): boolean {
    return threadId?.startsWith(CLAUDE_PENDING_THREAD_PREFIX) ?? false;
}

function assertClaudeCodeProvider(
    provider: ProviderConfig,
): asserts provider is ClaudeCodeProviderConfig {
    invariant(
        provider.kind === "claude-code",
        `Claude Code runtime received provider kind '${provider.kind}'.`,
    );
}

function configuredModels(
    provider: ClaudeCodeProviderConfig,
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

function createClaudeCodeProviderEvent(params: {
    eventType: string;
    phase: RuntimeProviderEvent["phase"];
    summary: string;
    metadata: Record<string, RuntimeProviderEventMetadata>;
    stable?: boolean;
}): RuntimeProviderEvent {
    return {
        id: crypto.randomUUID(),
        providerKind: "claude-code",
        eventType: params.eventType,
        phase: params.phase,
        summary: params.summary,
        stable: params.stable ?? true,
        metadata: params.metadata,
    };
}

function sanitizeProviderMetadataValue(
    value: unknown,
    depth = 0,
): RuntimeProviderEventMetadata | undefined {
    if (value === null) {
        return null;
    }
    if (
        typeof value === "number" ||
        typeof value === "boolean" ||
        typeof value === "string"
    ) {
        if (typeof value !== "string" || value.length <= 16_000) {
            return value;
        }
        return `${value.slice(0, 16_000)}... [truncated]`;
    }
    if (depth >= 4) {
        return undefined;
    }
    if (Array.isArray(value)) {
        const items = value
            .slice(0, 50)
            .map((item) => sanitizeProviderMetadataValue(item, depth + 1))
            .filter((item): item is RuntimeProviderEventMetadata => {
                return item !== undefined;
            });
        return items;
    }
    if (!isRecord(value)) {
        return undefined;
    }

    const metadata: Record<string, RuntimeProviderEventMetadata> = {};
    for (const [key, childValue] of Object.entries(value).slice(0, 50)) {
        const sanitized = sanitizeProviderMetadataValue(childValue, depth + 1);
        if (sanitized !== undefined) {
            metadata[key] = sanitized;
        }
    }
    return metadata;
}

function providerArtifactForClaudeEvent(
    event: Record<string, unknown>,
): RuntimeKindEvent {
    const metadata = sanitizeProviderMetadataValue(event);
    return {
        type: "provider_event",
        event: createClaudeCodeProviderEvent({
            eventType: `claude-code.${String(event.type ?? "event")}`,
            phase: "artifact",
            summary: "Claude Code stream event captured.",
            stable: false,
            metadata: isRecord(metadata)
                ? metadata
                : { value: metadata ?? null },
        }),
    };
}

function extractTextBlocks(event: Record<string, unknown>): string[] {
    const message = isRecord(event.message) ? event.message : null;
    const content = Array.isArray(message?.content) ? message.content : [];
    const textBlocks: string[] = [];

    for (const block of content) {
        if (!isRecord(block)) {
            continue;
        }
        if (block.type === "text" && typeof block.text === "string") {
            textBlocks.push(block.text);
        }
    }
    return textBlocks;
}

function extractSessionId(event: Record<string, unknown>): string | null {
    const direct = event.session_id ?? event.sessionId;
    if (typeof direct === "string" && direct.trim()) {
        return direct;
    }

    const message = isRecord(event.message) ? event.message : null;
    const nested = message?.session_id ?? message?.sessionId;
    return typeof nested === "string" && nested.trim() ? nested : null;
}

function extractResultStatus(event: Record<string, unknown>): {
    status: "completed" | "errored";
    errorMessage?: string;
} {
    if (event.is_error === true) {
        return {
            status: "errored",
            errorMessage:
                typeof event.result === "string"
                    ? event.result
                    : "Claude Code run failed",
        };
    }

    const subtype = typeof event.subtype === "string" ? event.subtype : null;
    if (subtype === "error_max_turns" || subtype === "error_during_execution") {
        return {
            status: "errored",
            errorMessage:
                typeof event.result === "string"
                    ? event.result
                    : `Claude Code run failed with subtype ${subtype}.`,
        };
    }

    return { status: "completed" };
}

function createCompletionEvent(
    event: Record<string, unknown>,
): RuntimeProviderEvent {
    const metadataValue = sanitizeProviderMetadataValue(event);
    return createClaudeCodeProviderEvent({
        eventType: "claude-code.result",
        phase: "completion",
        summary: "Claude Code turn completed.",
        metadata: isRecord(metadataValue)
            ? metadataValue
            : { result: metadataValue ?? null },
    });
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function resolveClaudePermissionMode(
    providerMode: ClaudeCodeProviderConfig["claudeCode"]["permissionMode"],
    variantId: string | null,
): string | null {
    if (variantId === "plan") {
        return "plan";
    }
    switch (providerMode) {
        case "default":
            return null;
        case "auto":
            return "acceptEdits";
        case "dontAsk":
            return "bypassPermissions";
        case "acceptEdits":
        case "plan":
        case "bypassPermissions":
            return providerMode;
    }
}

function buildClaudeArgs(params: {
    provider: ClaudeCodeProviderConfig;
    modelId: string;
    variantId: string | null;
    sessionId: string | null;
}): string[] {
    const permissionMode = resolveClaudePermissionMode(
        params.provider.claudeCode.permissionMode,
        params.variantId,
    );
    const args = [
        ...params.provider.claudeCode.args,
        "--print",
        "--output-format",
        "stream-json",
        "--include-partial-messages",
    ];

    if (permissionMode) {
        args.push("--permission-mode", permissionMode);
    }
    if (params.sessionId) {
        args.push("--resume", params.sessionId);
    }
    if (params.modelId && params.modelId !== "default") {
        args.push("--model", params.modelId);
    }

    return args;
}

function processExitSummary(exit: RuntimeProcessExit): string {
    if (exit.type === "error") {
        return exit.error.message;
    }
    return `Claude Code exited (${exit.code ?? "null"} / ${
        exit.signal ?? "null"
    })`;
}

function isRecoverableClaudeResumeFailure(message: string): boolean {
    const normalized = message.toLowerCase();
    return (
        normalized.includes("session") &&
        normalized.includes("resume") &&
        /not found|missing|does not exist|no longer exists|unknown|invalid|could not|couldn't|unable|failed/.test(
            normalized,
        )
    );
}

class ClaudeCodeRuntimeKindSession implements RuntimeKindSession {
    private readonly eventHandlers = new Set<
        (event: RuntimeKindEvent) => void
    >();
    private readonly exitHandlers = new Set<(error: Error) => void>();
    private activeProcess: ManagedRuntimeProcess | null = null;
    private activeProcessGeneration = 0;
    private activeTurnId: string | null = null;
    private activeTurnParams: RuntimeStartTurnParams | null = null;
    private activeProcessSessionId: string | null = null;
    private currentSessionId: string | null = null;
    private stdoutDrained = false;
    private pendingProcessExit: RuntimeProcessExit | null = null;
    private terminalEventEmitted = false;
    private emittedAssistantText = false;
    private emittedMeaningfulOutput = false;
    private resumeRetryAttempted = false;
    private stoppingForInterrupt = false;
    private turnTimedOut = false;
    private turnTimeout: ReturnType<typeof setTimeout> | null = null;
    private pendingResultCompletion: {
        status: "completed" | "errored";
        errorMessage?: string;
        providerEvent: RuntimeProviderEvent;
    } | null = null;
    private readonly stderrChunks: string[] = [];

    constructor(
        private readonly provider: ClaudeCodeProviderConfig,
        private readonly createProcess: CreateClaudeCodeProcess,
    ) {}

    async initialize(): Promise<RuntimeKindLifecycleResult> {
        return {
            providerEvents: [
                createClaudeCodeProviderEvent({
                    eventType: "claude-code.initialized",
                    phase: "initialization",
                    summary: "Claude Code runtime initialized.",
                    metadata: {
                        lifecycleModel: "per-turn-subprocess",
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
        const persistedSessionId =
            params.bindingProviderId === params.providerId
                ? params.bindingThreadId
                : null;
        this.currentSessionId =
            persistedSessionId && !isClaudePendingThreadId(persistedSessionId)
                ? persistedSessionId
                : null;
        const threadId =
            this.currentSessionId ??
            `${CLAUDE_PENDING_THREAD_PREFIX}${crypto.randomUUID()}`;
        return {
            threadId,
            isNew: !this.currentSessionId,
            providerEvents: [
                createClaudeCodeProviderEvent({
                    eventType: this.currentSessionId
                        ? "claude-code.session.resumed"
                        : "claude-code.session.pending",
                    phase: "thread",
                    summary: this.currentSessionId
                        ? "Claude Code session will be resumed."
                        : "Claude Code session id pending first stream event.",
                    metadata: {
                        threadId,
                        requestedModel: params.modelId,
                    },
                }),
            ],
        };
    }

    async startTurn(
        params: RuntimeStartTurnParams,
    ): Promise<RuntimeKindLifecycleResult & { turnId: string }> {
        if (this.activeProcess && !this.activeProcess.hasExited) {
            throw new Error("Claude Code turn already in progress.");
        }
        if (this.activeTurnId && !this.terminalEventEmitted) {
            throw new Error("Claude Code turn already in progress.");
        }

        const turnId = crypto.randomUUID();
        this.activeTurnId = turnId;
        this.activeTurnParams = params;
        this.terminalEventEmitted = false;
        this.emittedAssistantText = false;
        this.emittedMeaningfulOutput = false;
        this.resumeRetryAttempted = false;
        this.stoppingForInterrupt = false;
        this.turnTimedOut = false;
        this.pendingResultCompletion = null;
        const cwd = this.provider.claudeCode.cwd ?? params.cwd;
        this.launchTurnProcess(params, this.currentSessionId);

        return {
            turnId,
            providerEvents: [
                createClaudeCodeProviderEvent({
                    eventType: "claude-code.turn.started",
                    phase: "turn",
                    summary: "Claude Code turn started.",
                    metadata: {
                        turnId,
                        threadId: params.threadId,
                        requestedModel: params.modelId,
                        cwd,
                        permissionMode:
                            resolveClaudePermissionMode(
                                this.provider.claudeCode.permissionMode,
                                params.variantId,
                            ) ?? "default",
                    },
                }),
            ],
        };
    }

    private launchTurnProcess(
        params: RuntimeStartTurnParams,
        sessionId: string | null,
    ): void {
        this.activeProcessGeneration += 1;
        const processGeneration = this.activeProcessGeneration;
        this.stderrChunks.length = 0;
        this.stdoutDrained = false;
        this.pendingProcessExit = null;
        this.activeProcessSessionId = sessionId;
        const args = buildClaudeArgs({
            provider: this.provider,
            modelId: params.modelId,
            variantId: params.variantId,
            sessionId,
        });
        const cwd = this.provider.claudeCode.cwd ?? params.cwd;
        const runtimeProcess = this.createProcess({
            command: this.provider.claudeCode.command,
            args,
            cwd,
            env: {
                ...process.env,
                ...this.provider.claudeCode.baseEnv,
            },
            stopPolicy: CLAUDE_CODE_STOP_POLICY,
            onStderr: (chunk) => {
                this.stderrChunks.push(chunk);
            },
        });

        this.activeProcess = runtimeProcess;
        runtimeProcess.stdin.end(params.inputText);
        attachJsonlParser(runtimeProcess.stdout, {
            onValue: (value) => this.handleStreamValue(value),
            onError: (error) => this.handleParseError(error),
        });
        runtimeProcess.stdout.once("end", () => {
            if (processGeneration !== this.activeProcessGeneration) {
                return;
            }
            this.stdoutDrained = true;
            this.maybeFinalizeProcessExit();
        });
        runtimeProcess.onExit((exit) => {
            if (processGeneration !== this.activeProcessGeneration) {
                return;
            }
            this.handleProcessExit(exit);
        });
        this.scheduleTurnTimeout();
    }

    async interruptTurn(): Promise<void> {
        if (!this.activeProcess || this.activeProcess.hasExited) {
            return;
        }
        this.clearTurnTimeout();
        this.stoppingForInterrupt = true;
        await this.activeProcess.stop();
    }

    onEvent(handler: (event: RuntimeKindEvent) => void): void {
        this.eventHandlers.add(handler);
    }

    onExit(handler: (error: Error) => void): void {
        this.exitHandlers.add(handler);
    }

    async stop(): Promise<void> {
        if (!this.activeProcess || this.activeProcess.hasExited) {
            return;
        }
        this.clearTurnTimeout();
        await this.activeProcess.stop();
    }

    private scheduleTurnTimeout(): void {
        const timeoutMs = this.provider.claudeCode.timeoutMs;
        if (!timeoutMs) {
            return;
        }

        this.turnTimeout = setTimeout(() => {
            this.turnTimeout = null;
            this.turnTimedOut = true;
            const activeProcess = this.activeProcess;
            if (!activeProcess || activeProcess.hasExited) {
                return;
            }
            void activeProcess.stop().catch((error) => {
                if (this.terminalEventEmitted) {
                    return;
                }
                const message =
                    error instanceof Error ? error.message : String(error);
                this.emitTerminalEvent({
                    status: "errored",
                    errorMessage: message,
                    providerEvent: createClaudeCodeProviderEvent({
                        eventType: "claude-code.turn.timeout-stop-failed",
                        phase: "completion",
                        summary: "Claude Code turn timeout cleanup failed.",
                        metadata: {
                            turnId: this.activeTurnId,
                            timeoutMs,
                            errorMessage: message,
                        },
                    }),
                });
            });
        }, timeoutMs);
    }

    private clearTurnTimeout(): void {
        if (!this.turnTimeout) {
            return;
        }
        clearTimeout(this.turnTimeout);
        this.turnTimeout = null;
    }

    private handleStreamValue(value: unknown): void {
        if (!isRecord(value)) {
            this.emit(providerArtifactForClaudeEvent({ value }));
            return;
        }

        const sessionId = extractSessionId(value);
        if (sessionId && sessionId !== this.currentSessionId) {
            this.currentSessionId = sessionId;
            this.emit({
                type: "provider_identity_updated",
                threadId: sessionId,
                providerEvents: [
                    createClaudeCodeProviderEvent({
                        eventType: "claude-code.session.identified",
                        phase: "thread",
                        summary: "Claude Code session id captured.",
                        metadata: { sessionId },
                    }),
                ],
            });
        }

        if (value.type === "assistant") {
            const textBlocks = extractTextBlocks(value);
            const events: RuntimeKindEvent[] = [];
            for (const text of textBlocks) {
                if (text.length > 0) {
                    this.emittedAssistantText = true;
                    this.emittedMeaningfulOutput = true;
                    events.push({ type: "assistant_delta", delta: text });
                }
            }

            const message = isRecord(value.message) ? value.message : null;
            const content = Array.isArray(message?.content)
                ? message.content
                : [];
            if (
                content.some(
                    (block) => isRecord(block) && block.type !== "text",
                )
            ) {
                this.emittedMeaningfulOutput = true;
                events.push(providerArtifactForClaudeEvent(value));
            }

            for (const event of events) {
                this.emit(event);
            }
            return;
        }

        if (value.type === "result") {
            this.emittedMeaningfulOutput = true;
            if (
                !this.emittedAssistantText &&
                typeof value.result === "string" &&
                value.result.length > 0
            ) {
                this.emit({ type: "assistant_delta", delta: value.result });
            }
            const resultStatus = extractResultStatus(value);
            this.pendingResultCompletion = {
                status: resultStatus.status,
                errorMessage: resultStatus.errorMessage,
                providerEvent: createCompletionEvent(value),
            };
            if (
                this.pendingProcessExit &&
                (this.stdoutDrained || this.pendingProcessExit.type === "error")
            ) {
                this.emitPendingResultCompletion();
            }
            return;
        }

        if (value.type !== "system") {
            this.emittedMeaningfulOutput = true;
            this.emit(providerArtifactForClaudeEvent(value));
        }
    }

    private handleParseError(error: JsonlParseError): void {
        this.emittedMeaningfulOutput = true;
        this.emit({
            type: "provider_event",
            event: createClaudeCodeProviderEvent({
                eventType: "claude-code.parse-error",
                phase: "diagnostic",
                summary: "Claude Code emitted malformed JSONL.",
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

    private handleProcessExit(exit: RuntimeProcessExit): void {
        this.clearTurnTimeout();
        this.activeProcess = null;
        this.pendingProcessExit = exit;

        if (exit.type === "error") {
            this.stdoutDrained = true;
        }

        this.maybeFinalizeProcessExit();
    }

    private maybeFinalizeProcessExit(): void {
        const exit = this.pendingProcessExit;
        if (!exit || (!this.stdoutDrained && exit.type !== "error")) {
            return;
        }
        this.pendingProcessExit = null;

        if (this.terminalEventEmitted) {
            return;
        }

        if (this.turnTimedOut) {
            const timeoutMs = this.provider.claudeCode.timeoutMs;
            const message = `Claude Code turn timed out after ${timeoutMs}ms.`;
            this.emitTerminalEvent({
                status: "errored",
                errorMessage: message,
                providerEvent: createClaudeCodeProviderEvent({
                    eventType: "claude-code.turn.timed-out",
                    phase: "completion",
                    summary: "Claude Code turn timed out.",
                    metadata: {
                        turnId: this.activeTurnId,
                        timeoutMs: timeoutMs ?? null,
                        errorMessage: message,
                    },
                }),
            });
            return;
        }

        if (this.stoppingForInterrupt) {
            this.emitTerminalEvent({
                status: "interrupted",
                providerEvent: createClaudeCodeProviderEvent({
                    eventType: "claude-code.turn.interrupted",
                    phase: "completion",
                    summary: "Claude Code turn interrupted.",
                    metadata: {
                        turnId: this.activeTurnId,
                    },
                }),
            });
            return;
        }

        if (this.pendingResultCompletion) {
            this.emitPendingResultCompletion();
            return;
        }

        if (exit.type === "exit" && exit.code === 0) {
            this.emitTerminalEvent({
                status: "completed",
                providerEvent: createClaudeCodeProviderEvent({
                    eventType: "claude-code.turn.exited",
                    phase: "completion",
                    summary: "Claude Code turn exited successfully.",
                    metadata: {
                        turnId: this.activeTurnId,
                    },
                }),
            });
            return;
        }

        const stderr = this.stderrChunks.join("").trim();
        const message = stderr || processExitSummary(exit);
        if (this.shouldRetryWithoutResume(message)) {
            const staleSessionId = this.activeProcessSessionId;
            const retryParams = this.activeTurnParams;
            invariant(
                retryParams,
                "Expected active Claude Code turn params for resume retry.",
            );
            this.resumeRetryAttempted = true;
            this.currentSessionId = null;
            this.pendingResultCompletion = null;
            this.pendingProcessExit = null;
            this.emittedAssistantText = false;
            this.emittedMeaningfulOutput = false;
            this.emit({
                type: "provider_event",
                event: createClaudeCodeProviderEvent({
                    eventType: "claude-code.session.resume-failed",
                    phase: "thread",
                    summary:
                        "Claude Code session resume failed; retrying with a fresh session.",
                    metadata: {
                        turnId: this.activeTurnId,
                        staleSessionId,
                        errorMessage: message,
                    },
                }),
            });
            this.launchTurnProcess(retryParams, null);
            return;
        }

        this.emitTerminalEvent({
            status: "errored",
            errorMessage: message,
            providerEvent: createClaudeCodeProviderEvent({
                eventType: "claude-code.turn.failed",
                phase: "completion",
                summary: "Claude Code turn failed.",
                metadata: {
                    turnId: this.activeTurnId,
                    errorMessage: message,
                },
            }),
        });
    }

    private emitTerminalEvent(params: {
        status: "completed" | "interrupted" | "errored";
        errorMessage?: string;
        providerEvent: RuntimeProviderEvent;
    }): void {
        if (this.terminalEventEmitted) {
            return;
        }
        this.terminalEventEmitted = true;
        this.clearTurnTimeout();
        this.pendingResultCompletion = null;
        this.emit({ type: "provider_event", event: params.providerEvent });
        this.emit({
            type: "turn_completed",
            status: params.status,
            errorMessage: params.errorMessage,
        });
        this.activeTurnId = null;
        this.activeTurnParams = null;
        this.activeProcessSessionId = null;
    }

    private shouldRetryWithoutResume(message: string): boolean {
        return (
            !!this.activeProcessSessionId &&
            !this.resumeRetryAttempted &&
            !this.emittedMeaningfulOutput &&
            isRecoverableClaudeResumeFailure(message)
        );
    }

    private emit(event: RuntimeKindEvent): void {
        for (const handler of this.eventHandlers) {
            handler(event);
        }
    }

    private emitPendingResultCompletion(): void {
        const pending = this.pendingResultCompletion;
        if (!pending) {
            return;
        }
        this.pendingResultCompletion = null;
        this.emitTerminalEvent(pending);
    }
}

export class ClaudeCodeRuntimeKind implements RuntimeKind {
    readonly kind = "claude-code";
    readonly capabilities = CLAUDE_CODE_RUNTIME_CAPABILITIES;
    private readonly createRuntimeProcess: CreateClaudeCodeProcess;

    constructor(
        params: {
            createRuntimeProcess?: CreateClaudeCodeProcess;
        } = {},
    ) {
        this.createRuntimeProcess =
            params.createRuntimeProcess ??
            ((processParams) =>
                new ManagedRuntimeProcess({
                    ...processParams,
                    label: "Claude Code",
                    onStderr: processParams.onStderr,
                }));
    }

    createSession(params: {
        provider: ProviderConfig;
        agent: AgentConfig;
    }): RuntimeKindSession {
        assertClaudeCodeProvider(params.provider);
        return new ClaudeCodeRuntimeKindSession(
            params.provider,
            this.createRuntimeProcess,
        );
    }

    shouldRecycleProvider(
        current: ProviderConfig,
        next: ProviderConfig,
    ): boolean {
        assertClaudeCodeProvider(current);
        assertClaudeCodeProvider(next);
        return (
            current.claudeCode.command !== next.claudeCode.command ||
            JSON.stringify(current.claudeCode.args) !==
                JSON.stringify(next.claudeCode.args) ||
            JSON.stringify(current.claudeCode.baseEnv) !==
                JSON.stringify(next.claudeCode.baseEnv) ||
            current.claudeCode.cwd !== next.claudeCode.cwd ||
            current.claudeCode.permissionMode !==
                next.claudeCode.permissionMode ||
            current.claudeCode.timeoutMs !== next.claudeCode.timeoutMs
        );
    }

    async listModels(params: {
        provider: ProviderConfig;
        agent: AgentConfig;
    }): Promise<ProviderModelCatalogEntry[]> {
        assertClaudeCodeProvider(params.provider);
        return configuredModels(params.provider) ?? DEFAULT_CLAUDE_CODE_MODELS;
    }
}
