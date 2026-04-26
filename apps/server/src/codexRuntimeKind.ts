import type { AgentConfig, ProviderConfig } from "./config.ts";
import {
    CodexAppServerClient,
    type CodexClient,
    type CreateCodexClient,
    type JsonRpcNotification,
} from "./codexAppServerClient.ts";
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

type CodexModelListResponse = {
    data?: Array<{
        id?: string;
        displayName?: string;
        hidden?: boolean;
        supportedReasoningEfforts?: Array<{
            reasoningEffort?: string;
        }>;
        defaultReasoningEffort?: string;
    }>;
    nextCursor?: string | null;
};

const RECOVERABLE_THREAD_RESUME_ERROR_SNIPPETS = [
    "not found",
    "missing thread",
    "no such thread",
    "unknown thread",
    "does not exist",
    "no rollout found",
    "is closing",
];

export const CODEX_RUNTIME_CAPABILITIES = {
    lifecycleModel: "persistent-session",
    modelCatalogSource: "live",
    resumability: ["thread-id"],
    cancellation: ["cooperative-command"],
    approval: "auto-approve",
    artifacts: [
        "lifecycle",
        "usage",
        "reasoning",
        "command",
        "diff",
        "model",
        "diagnostic",
    ],
    workspace: ["shared-root", "copy-on-conversation"],
} as const satisfies RuntimeKindCapabilities;

function invariant(condition: unknown, message: string): asserts condition {
    if (!condition) {
        throw new Error(message);
    }
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

export function isRecoverableThreadResumeError(error: unknown): boolean {
    const message = (
        error instanceof Error ? error.message : String(error)
    ).toLowerCase();
    return RECOVERABLE_THREAD_RESUME_ERROR_SNIPPETS.some((snippet) =>
        message.includes(snippet),
    );
}

function resolveCodexEffort(variantId: string | null): string {
    return variantId ?? "medium";
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

function getCodexMethodEventType(method: string): string {
    const methodPath = method.startsWith("codex/event/")
        ? method.slice("codex/event/".length)
        : method;
    return `codex.${methodPath
        .replace(/([a-z0-9])([A-Z])/g, "$1.$2")
        .replace(/[^a-zA-Z0-9]+/g, ".")
        .replace(/^\.+|\.+$/g, "")
        .toLowerCase()}`;
}

function getCodexArtifactKind(method: string): string {
    const methodPath = method.startsWith("item/")
        ? method.slice("item/".length)
        : method.startsWith("codex/event/")
          ? method.slice("codex/event/".length)
          : method;
    return methodPath
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .replace(/[^a-zA-Z0-9]+/g, " ")
        .trim()
        .toLowerCase();
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

function pickMetadataValue(
    sources: Array<Record<string, unknown> | null>,
    keys: string[],
): RuntimeProviderEventMetadata | undefined {
    for (const source of sources) {
        if (!source) {
            continue;
        }
        for (const key of keys) {
            if (!(key in source)) {
                continue;
            }
            const value = sanitizeProviderMetadataValue(source[key]);
            if (value !== undefined) {
                return value;
            }
        }
    }
    return undefined;
}

function addMetadataIfPresent(
    metadata: Record<string, RuntimeProviderEventMetadata>,
    targetKey: string,
    sources: Array<Record<string, unknown> | null>,
    sourceKeys: string[],
): void {
    const value = pickMetadataValue(sources, sourceKeys);
    if (value !== undefined) {
        metadata[targetKey] = value;
    }
}

function createCodexArtifactMetadata(
    method: string,
    params: Record<string, unknown> | undefined,
): Record<string, RuntimeProviderEventMetadata> {
    const message = getCodexEventMessage(params);
    const item = isRecord(params?.item) ? params.item : null;
    const artifact = isRecord(params?.artifact) ? params.artifact : null;
    const event = isRecord(params?.event) ? params.event : null;
    const sources = [params ?? null, message, item, artifact, event];
    const metadata: Record<string, RuntimeProviderEventMetadata> = {
        method,
        artifactKind: getCodexArtifactKind(method),
    };

    addMetadataIfPresent(metadata, "itemId", sources, [
        "id",
        "itemId",
        "item_id",
        "callId",
        "call_id",
    ]);
    addMetadataIfPresent(metadata, "itemType", sources, [
        "type",
        "kind",
        "itemType",
        "item_type",
    ]);
    addMetadataIfPresent(metadata, "status", sources, ["status", "state"]);
    addMetadataIfPresent(metadata, "title", sources, [
        "title",
        "summary",
        "name",
    ]);
    addMetadataIfPresent(metadata, "text", sources, [
        "text",
        "content",
        "message",
        "reasoning",
        "plan",
        "review",
    ]);
    addMetadataIfPresent(metadata, "command", sources, [
        "command",
        "cmd",
        "shellCommand",
        "shell_command",
    ]);
    addMetadataIfPresent(metadata, "output", sources, [
        "output",
        "stdout",
        "stderr",
    ]);
    addMetadataIfPresent(metadata, "diff", sources, ["diff", "patch"]);
    addMetadataIfPresent(metadata, "exitCode", sources, [
        "exitCode",
        "exit_code",
        "code",
    ]);
    addMetadataIfPresent(metadata, "cwd", sources, [
        "cwd",
        "workingDirectory",
        "working_directory",
    ]);
    addMetadataIfPresent(metadata, "path", sources, [
        "path",
        "filePath",
        "file_path",
    ]);
    addMetadataIfPresent(metadata, "files", sources, [
        "files",
        "paths",
        "changes",
    ]);

    return metadata;
}

function createCodexArtifactEvent(
    method: string,
    params: Record<string, unknown> | undefined,
): RuntimeProviderEvent {
    const artifactKind = getCodexArtifactKind(method);
    return createCodexProviderEvent({
        eventType: getCodexMethodEventType(method),
        phase: "artifact",
        summary: `Codex ${artifactKind} artifact captured.`,
        metadata: createCodexArtifactMetadata(method, params),
    });
}

function normalizeNotification(
    notification: JsonRpcNotification,
): RuntimeKindEvent[] {
    if (notification.method === "codex/event/agent_reasoning") {
        const text = getAgentReasoningText(notification.params);
        const artifactEvent: RuntimeKindEvent = {
            type: "provider_event",
            event: createCodexArtifactEvent(
                notification.method,
                notification.params,
            ),
        };
        return text ? [artifactEvent, { type: "reasoning", text }] : [];
    }

    if (notification.method === "item/agentMessage/delta") {
        const delta = notification.params?.delta;
        return typeof delta === "string"
            ? [{ type: "assistant_delta", delta }]
            : [];
    }

    if (notification.method?.startsWith("item/")) {
        return [
            {
                type: "provider_event",
                event: createCodexArtifactEvent(
                    notification.method,
                    notification.params,
                ),
            },
        ];
    }

    if (notification.method === "turn/aborted") {
        return [
            {
                type: "provider_event",
                event: createCodexProviderEvent({
                    eventType: "codex.turn.aborted",
                    phase: "completion",
                    summary: "Codex turn aborted.",
                    metadata: {},
                }),
            },
            { type: "turn_aborted" },
        ];
    }

    if (notification.method !== "turn/completed") {
        return [];
    }

    const turn = notification.params?.turn as
        | { status?: unknown; error?: { message?: unknown } }
        | undefined;
    const status = turn?.status;
    const completionEvent: RuntimeKindEvent = {
        type: "provider_event",
        event: createCodexCompletionEvent(notification.params),
    };
    if (status === "completed" || status === "interrupted") {
        return [completionEvent, { type: "turn_completed", status }];
    }

    return [
        completionEvent,
        {
            type: "turn_completed",
            status: "errored",
            errorMessage:
                typeof turn?.error?.message === "string"
                    ? turn.error.message
                    : "Codex run failed",
        },
    ];
}

function createCodexProviderEvent(params: {
    eventType: string;
    phase: RuntimeProviderEvent["phase"];
    summary: string;
    metadata: Record<string, RuntimeProviderEventMetadata>;
}): RuntimeProviderEvent {
    return {
        id: crypto.randomUUID(),
        providerKind: "codex",
        eventType: params.eventType,
        phase: params.phase,
        summary: params.summary,
        stable: true,
        metadata: params.metadata,
    };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function pickString(
    source: Record<string, unknown> | null,
    keys: string[],
): string | null {
    if (!source) {
        return null;
    }

    for (const key of keys) {
        const value = source[key];
        if (typeof value === "string" && value.trim().length > 0) {
            return value;
        }
    }
    return null;
}

function pickUsageMetadata(
    source: Record<string, unknown> | null,
): Record<string, RuntimeProviderEventMetadata> {
    const usage = source?.usage ?? source?.tokenUsage ?? source?.token_usage;
    if (!isRecord(usage)) {
        return {};
    }

    const metadata: Record<string, RuntimeProviderEventMetadata> = {};
    for (const [key, value] of Object.entries(usage)) {
        if (
            typeof value === "number" ||
            typeof value === "string" ||
            typeof value === "boolean" ||
            value === null
        ) {
            metadata[key] = value;
        }
    }
    return metadata;
}

function createCodexCompletionEvent(
    params: Record<string, unknown> | undefined,
): RuntimeProviderEvent {
    const turn = isRecord(params?.turn) ? params.turn : null;
    const status = pickString(turn, ["status"]) ?? "unknown";
    const metadata: Record<string, RuntimeProviderEventMetadata> = {
        status,
        ...pickUsageMetadata(turn),
    };
    const model = pickString(turn, ["model", "modelId", "model_id"]);
    const turnId = pickString(turn, ["id", "turnId", "turn_id"]);
    if (model) {
        metadata.model = model;
    }
    if (turnId) {
        metadata.turnId = turnId;
    }

    const errorMessage =
        isRecord(turn?.error) && typeof turn.error.message === "string"
            ? turn.error.message
            : null;
    if (errorMessage) {
        metadata.errorMessage = errorMessage;
    }

    return createCodexProviderEvent({
        eventType: "codex.turn.completed",
        phase: "completion",
        summary: `Codex turn completed with status ${status}.`,
        metadata,
    });
}

function toTitleCase(value: string): string {
    return value
        .split(/[-_]/g)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
}

function mapCodexEffortToVariant(
    effort: string,
): { id: string; label: string } | null {
    if (effort === "none") {
        return null;
    }

    switch (effort) {
        case "xhigh":
            return { id: effort, label: "X-High" };
        default:
            return {
                id: effort,
                label: toTitleCase(effort),
            };
    }
}

function normalizeLiveModels(
    result: CodexModelListResponse,
): ProviderModelCatalogEntry[] {
    const items = result.data ?? [];

    return items
        .filter((item) => item.hidden !== true && typeof item.id === "string")
        .map((item) => {
            const seenVariantIds = new Set<string>();
            const variants =
                item.supportedReasoningEfforts
                    ?.map((effortOption) =>
                        mapCodexEffortToVariant(
                            effortOption.reasoningEffort ?? "",
                        ),
                    )
                    .filter(
                        (variant): variant is { id: string; label: string } => {
                            if (!variant) {
                                return false;
                            }
                            if (seenVariantIds.has(variant.id)) {
                                return false;
                            }
                            seenVariantIds.add(variant.id);
                            return true;
                        },
                    ) ?? [];
            const defaultVariant =
                typeof item.defaultReasoningEffort === "string"
                    ? mapCodexEffortToVariant(item.defaultReasoningEffort)
                    : null;
            const defaultVariantId =
                defaultVariant &&
                variants.some((variant) => variant.id === defaultVariant.id)
                    ? defaultVariant.id
                    : null;
            const providerMetadata: Record<
                string,
                string | number | boolean | null
            > = {};
            if (typeof item.defaultReasoningEffort === "string") {
                providerMetadata.defaultReasoningEffort =
                    item.defaultReasoningEffort;
            }

            return {
                id: item.id!,
                label:
                    typeof item.displayName === "string" &&
                    item.displayName.length > 0
                        ? item.displayName
                        : item.id!,
                supportsReasoning: variants.length > 0,
                variants,
                defaultVariantId,
                providerMetadata,
            };
        });
}

class CodexRuntimeKindSession implements RuntimeKindSession {
    constructor(private readonly client: CodexClient) {}

    async initialize(): Promise<RuntimeKindLifecycleResult> {
        await this.client.initialize();
        return {
            providerEvents: [
                createCodexProviderEvent({
                    eventType: "codex.initialized",
                    phase: "initialization",
                    summary: "Codex runtime initialized.",
                    metadata: {},
                }),
            ],
        };
    }

    async openThread(
        params: RuntimeOpenThreadParams,
    ): Promise<
        RuntimeKindLifecycleResult & { threadId: string; isNew: boolean }
    > {
        const threadOpenParams = {
            model: params.modelId,
            cwd: params.cwd,
            approvalPolicy: "never",
            sandbox: "danger-full-access",
            personality: "pragmatic",
            experimentalRawEvents: false,
            persistExtendedHistory: true,
        };

        const persistedThreadId =
            params.bindingProviderId === params.providerId
                ? params.bindingThreadId
                : null;

        if (persistedThreadId) {
            try {
                const threadResult = await this.client.request(
                    "thread/resume",
                    {
                        ...threadOpenParams,
                        threadId: persistedThreadId,
                    },
                );
                return {
                    threadId: extractThreadId(threadResult),
                    isNew: false,
                    providerEvents: [
                        createCodexProviderEvent({
                            eventType: "codex.thread.resumed",
                            phase: "thread",
                            summary: "Codex thread resumed.",
                            metadata: {
                                threadId: extractThreadId(threadResult),
                                requestedModel: params.modelId,
                            },
                        }),
                    ],
                };
            } catch (error) {
                if (!isRecoverableThreadResumeError(error)) {
                    await this.stopCodexClientSafely(
                        "non-recoverable thread resume cleanup",
                    );
                    throw error;
                }
            }
        }

        const threadResult = await this.client.request(
            "thread/start",
            threadOpenParams,
        );
        return {
            threadId: extractThreadId(threadResult),
            isNew: true,
            providerEvents: [
                createCodexProviderEvent({
                    eventType: "codex.thread.started",
                    phase: "thread",
                    summary: "Codex thread started.",
                    metadata: {
                        threadId: extractThreadId(threadResult),
                        requestedModel: params.modelId,
                    },
                }),
            ],
        };
    }

    async startTurn(
        params: RuntimeStartTurnParams,
    ): Promise<RuntimeKindLifecycleResult & { turnId: string }> {
        const turnResult = await this.client.request("turn/start", {
            threadId: params.threadId,
            input: [{ type: "text", text: params.inputText }],
            cwd: params.cwd,
            approvalPolicy: "never",
            sandboxPolicy: {
                type: "dangerFullAccess",
            },
            model: params.modelId,
            effort: resolveCodexEffort(params.variantId),
            personality: "pragmatic",
        });
        const turnId = extractTurnId(turnResult);
        return {
            turnId,
            providerEvents: [
                createCodexProviderEvent({
                    eventType: "codex.turn.started",
                    phase: "turn",
                    summary: "Codex turn started.",
                    metadata: {
                        turnId,
                        threadId: params.threadId,
                        requestedModel: params.modelId,
                        effort: resolveCodexEffort(params.variantId),
                    },
                }),
            ],
        };
    }

    async interruptTurn(params: {
        threadId: string;
        turnId: string;
    }): Promise<void> {
        await this.client.request("turn/interrupt", params);
    }

    onEvent(handler: (event: RuntimeKindEvent) => void): void {
        this.client.onNotification((notification) => {
            for (const event of normalizeNotification(notification)) {
                handler(event);
            }
        });
    }

    onExit(handler: (error: Error) => void): void {
        this.client.onExit(handler);
    }

    async stop(): Promise<void> {
        await this.client.stop();
    }

    private async stopCodexClientSafely(reason: string): Promise<void> {
        try {
            await this.client.stop();
        } catch (error) {
            console.error(
                `[agentchat-server] failed to stop Codex client during ${reason}`,
                error,
            );
        }
    }
}

export class CodexRuntimeKind implements RuntimeKind {
    readonly kind = "codex";
    readonly capabilities = CODEX_RUNTIME_CAPABILITIES;
    private readonly createClient: CreateCodexClient;

    constructor(params: { createClient?: CreateCodexClient } = {}) {
        this.createClient =
            params.createClient ??
            ((clientParams) => new CodexAppServerClient(clientParams));
    }

    createSession(params: {
        provider: ProviderConfig;
        agent: AgentConfig;
    }): RuntimeKindSession {
        return new CodexRuntimeKindSession(this.createClient(params));
    }

    shouldRecycleProvider(
        current: ProviderConfig,
        next: ProviderConfig,
    ): boolean {
        return (
            current.codex.command !== next.codex.command ||
            JSON.stringify(current.codex.args) !==
                JSON.stringify(next.codex.args) ||
            JSON.stringify(current.codex.baseEnv) !==
                JSON.stringify(next.codex.baseEnv) ||
            current.codex.cwd !== next.codex.cwd
        );
    }

    async listModels(params: {
        provider: ProviderConfig;
        agent: AgentConfig;
    }): Promise<ProviderModelCatalogEntry[]> {
        const client = this.createClient(params);

        try {
            await client.initialize();

            const items: ProviderModelCatalogEntry[] = [];
            let cursor: string | null = null;

            do {
                const result = (await client.request("model/list", {
                    limit: 100,
                    cursor,
                    includeHidden: false,
                })) as CodexModelListResponse;

                items.push(...normalizeLiveModels(result));
                cursor = result.nextCursor ?? null;
            } while (cursor);

            return items;
        } finally {
            await client.stop();
        }
    }
}
