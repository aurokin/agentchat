import type {
    RuntimeKindEvent,
    RuntimeProviderEvent,
    RuntimeProviderEventMetadata,
} from "./runtimeKind.ts";
import type {
    RuntimeJsonRpcNotification,
    RuntimeJsonRpcRequest,
} from "./runtimeTransport.ts";
import { JsonRpcRequestError } from "./runtimeTransport.ts";

export const ACP_PROTOCOL_VERSION = 1;

export type AcpJsonRpcTransport = {
    request(method: string, params: unknown): Promise<unknown>;
    notify(method: string, params: unknown): void;
    onNotification(
        handler: (notification: RuntimeJsonRpcNotification) => void,
    ): void;
    onRequest(
        handler: (request: RuntimeJsonRpcRequest) => Promise<unknown> | unknown,
    ): void;
};

export type AcpClientInfo = {
    name: string;
    title: string;
    version: string;
};

export type AcpMcpServer = {
    type?: "stdio";
    name: string;
    command: string;
    args: string[];
    env?: Array<{
        name: string;
        value: string;
    }>;
};

export type AcpAgentCapabilities = {
    loadSession?: boolean;
    promptCapabilities?: Record<string, unknown>;
    mcpCapabilities?: {
        http?: boolean;
        sse?: boolean;
        [key: string]: unknown;
    };
    sessionCapabilities?: {
        resume?: Record<string, unknown>;
        close?: Record<string, unknown>;
        [key: string]: unknown;
    };
    [key: string]: unknown;
};

export type AcpInitializeResult = {
    protocolVersion: number;
    agentCapabilities: AcpAgentCapabilities;
    agentInfo?: Record<string, unknown>;
    authMethods?: unknown[];
    _meta?: Record<string, unknown> | null;
};

export type AcpSessionParams = {
    cwd: string;
    mcpServers?: AcpMcpServer[];
};

export type AcpLoadSessionParams = AcpSessionParams & {
    sessionId: string;
};

export type AcpPromptParams = {
    sessionId: string;
    text: string;
};

export type AcpPromptResult = {
    stopReason?: string;
    _meta?: Record<string, unknown> | null;
    [key: string]: unknown;
};

export type AcpPromptOutcome = {
    result: AcpPromptResult;
    events: RuntimeKindEvent[];
};

export type AcpSessionUpdateNotification = {
    sessionId?: string;
    update?: Record<string, unknown>;
    _meta?: Record<string, unknown> | null;
    [key: string]: unknown;
};

export type AcpPermissionMode = "auto-approve" | "fail-closed";

export type AcpProtocolClientEvent =
    | {
          type: "runtime_event";
          event: RuntimeKindEvent;
      }
    | {
          type: "permission_request";
          request: AcpRequestPermissionParams;
          outcome: AcpRequestPermissionOutcome;
      };

export type AcpRequestPermissionParams = {
    sessionId?: string;
    options?: Array<{
        optionId?: string;
        kind?: string;
        name?: string;
        [key: string]: unknown;
    }>;
    toolCall?: Record<string, unknown>;
    _meta?: Record<string, unknown> | null;
    [key: string]: unknown;
};

export type AcpRequestPermissionOutcome =
    | {
          outcome: "selected";
          optionId: string;
      }
    | {
          outcome: "cancelled";
      };

export class AcpProtocolClient {
    private readonly transport: AcpJsonRpcTransport;
    private readonly permissionMode: AcpPermissionMode;
    private initializeResult: AcpInitializeResult | null = null;
    private eventHandler: ((event: AcpProtocolClientEvent) => void) | null =
        null;

    constructor(params: {
        transport: AcpJsonRpcTransport;
        permissionMode?: AcpPermissionMode;
    }) {
        this.transport = params.transport;
        this.permissionMode = params.permissionMode ?? "fail-closed";
        this.transport.onNotification((notification) => {
            for (const event of mapAcpNotificationToRuntimeEvents(
                notification,
            )) {
                this.emit({ type: "runtime_event", event });
            }
        });
        this.transport.onRequest((request) => this.handleRequest(request));
    }

    onEvent(handler: (event: AcpProtocolClientEvent) => void): void {
        this.eventHandler = handler;
    }

    get capabilities(): AcpAgentCapabilities | null {
        return this.initializeResult?.agentCapabilities ?? null;
    }

    async initialize(
        clientInfo: AcpClientInfo = {
            name: "agentchat_server",
            title: "Agentchat Server",
            version: "0.2.0",
        },
    ): Promise<AcpInitializeResult> {
        const result = parseAcpInitializeResult(
            await this.transport.request("initialize", {
                protocolVersion: ACP_PROTOCOL_VERSION,
                clientCapabilities: {},
                clientInfo,
            }),
        );
        if (result.protocolVersion !== ACP_PROTOCOL_VERSION) {
            throw new Error(
                `Unsupported ACP protocol version ${result.protocolVersion}; expected ${ACP_PROTOCOL_VERSION}.`,
            );
        }
        this.initializeResult = result;
        return result;
    }

    async newSession(params: AcpSessionParams): Promise<string> {
        const result = await this.transport.request("session/new", {
            cwd: params.cwd,
            mcpServers: params.mcpServers ?? [],
        });
        return extractAcpSessionId(result, "session/new");
    }

    async loadSession(params: AcpLoadSessionParams): Promise<void> {
        if (!this.initializeResult?.agentCapabilities.loadSession) {
            throw new Error("ACP agent does not advertise loadSession.");
        }

        await this.transport.request("session/load", {
            sessionId: params.sessionId,
            cwd: params.cwd,
            mcpServers: params.mcpServers ?? [],
        });
    }

    async prompt(params: AcpPromptParams): Promise<AcpPromptOutcome> {
        const result = parseAcpPromptResult(
            await this.transport.request("session/prompt", {
                sessionId: params.sessionId,
                prompt: [
                    {
                        type: "text",
                        text: params.text,
                    },
                ],
            }),
        );
        return {
            result,
            events: mapAcpPromptResultToRuntimeEvents({
                sessionId: params.sessionId,
                result,
            }),
        };
    }

    cancel(params: { sessionId: string }): void {
        this.transport.notify("session/cancel", {
            sessionId: params.sessionId,
        });
    }

    private async handleRequest(
        request: RuntimeJsonRpcRequest,
    ): Promise<unknown> {
        if (request.method !== "session/request_permission") {
            throw new JsonRpcRequestError(
                -32601,
                `Unsupported ACP request '${request.method}'.`,
            );
        }

        const permissionRequest = parseAcpPermissionRequest(request.params);
        const outcome = resolveAcpPermissionRequest(
            permissionRequest,
            this.permissionMode,
        );
        this.emit({
            type: "runtime_event",
            event: {
                type: "provider_event",
                event: createAcpProviderEvent({
                    eventType: "acp.session.request_permission",
                    phase: "artifact",
                    summary: "ACP permission request",
                    stable: false,
                    sessionId: permissionRequest.sessionId,
                    metadata: {
                        request: sanitizeAcpMetadata(permissionRequest),
                    },
                }),
            },
        });
        this.emit({
            type: "permission_request",
            request: permissionRequest,
            outcome,
        });
        this.emit({
            type: "runtime_event",
            event: {
                type: "provider_event",
                event: createAcpProviderEvent({
                    eventType: "acp.session.permission_resolved",
                    phase: "artifact",
                    summary: "ACP permission resolved",
                    stable: true,
                    sessionId: permissionRequest.sessionId,
                    metadata: {
                        outcome: sanitizeAcpMetadata(outcome),
                    },
                }),
            },
        });
        return { outcome };
    }

    private emit(event: AcpProtocolClientEvent): void {
        this.eventHandler?.(event);
    }
}

export function mapAcpNotificationToRuntimeEvents(
    notification: RuntimeJsonRpcNotification,
): RuntimeKindEvent[] {
    if (notification.method !== "session/update") {
        return [];
    }

    return mapAcpSessionUpdateToRuntimeEvents(
        parseAcpSessionUpdate(notification.params),
    );
}

export function mapAcpSessionUpdateToRuntimeEvents(
    notification: AcpSessionUpdateNotification,
): RuntimeKindEvent[] {
    const update = notification.update ?? {};
    const updateKind =
        typeof update.sessionUpdate === "string"
            ? update.sessionUpdate
            : "unknown";

    if (updateKind === "agent_message_chunk") {
        const text = extractAcpText(update.content);
        if (text) {
            return [{ type: "assistant_delta", delta: text }];
        }
        return [
            {
                type: "provider_event",
                event: createAcpProviderEvent({
                    eventType: "acp.session.update.agent_message_chunk",
                    phase: "artifact",
                    summary: "ACP non-text agent message chunk",
                    stable: isStableAcpUpdate(update),
                    sessionId: notification.sessionId,
                    metadata: {
                        updateKind,
                        update: sanitizeAcpMetadata(update),
                    },
                }),
            },
        ];
    }

    return [
        {
            type: "provider_event",
            event: createAcpProviderEvent({
                eventType: `acp.session.update.${toEventToken(updateKind)}`,
                phase: "artifact",
                summary: `ACP ${updateKind} update`,
                stable: isStableAcpUpdate(update),
                sessionId: notification.sessionId,
                metadata: {
                    updateKind,
                    update: sanitizeAcpMetadata(update),
                },
            }),
        },
    ];
}

export function mapAcpPromptResultToRuntimeEvents(params: {
    sessionId?: string;
    result: AcpPromptResult;
}): RuntimeKindEvent[] {
    const stopReason =
        typeof params.result.stopReason === "string"
            ? params.result.stopReason
            : "unknown";
    const status =
        stopReason === "cancelled"
            ? "interrupted"
            : stopReason === "unknown"
              ? "errored"
              : "completed";
    const events: RuntimeKindEvent[] = [
        {
            type: "provider_event",
            event: createAcpProviderEvent({
                eventType: "acp.session.prompt.completed",
                phase: "completion",
                summary: `ACP prompt stopped: ${stopReason}`,
                stable: true,
                sessionId: params.sessionId,
                metadata: {
                    stopReason,
                    result: sanitizeAcpMetadata(params.result),
                },
            }),
        },
    ];

    if (status === "interrupted") {
        events.push({ type: "turn_aborted" });
        return events;
    }

    events.push({
        type: "turn_completed",
        status,
        errorMessage:
            status === "errored"
                ? "ACP prompt result did not include a stopReason."
                : undefined,
    });
    return events;
}

export function resolveAcpPermissionRequest(
    request: AcpRequestPermissionParams,
    mode: AcpPermissionMode,
): AcpRequestPermissionOutcome {
    if (mode === "auto-approve") {
        const selectedOption =
            request.options?.find((option) => {
                return (
                    typeof option.optionId === "string" &&
                    option.kind === "allow_once"
                );
            }) ??
            request.options?.find((option) => {
                return (
                    typeof option.optionId === "string" &&
                    option.kind === "allow"
                );
            });

        if (selectedOption?.optionId) {
            return {
                outcome: "selected",
                optionId: selectedOption.optionId,
            };
        }
    }

    return { outcome: "cancelled" };
}

export function createAcpProviderEvent(params: {
    eventType: string;
    phase: RuntimeProviderEvent["phase"];
    summary: string;
    stable: boolean;
    sessionId?: string;
    metadata?: Record<string, RuntimeProviderEventMetadata>;
}): RuntimeProviderEvent {
    return {
        id: params.sessionId
            ? `${params.eventType}:${params.sessionId}`
            : params.eventType,
        providerKind: "acp",
        eventType: params.eventType,
        phase: params.phase,
        summary: params.summary,
        stable: params.stable,
        metadata: {
            ...(params.sessionId ? { sessionId: params.sessionId } : {}),
            ...(params.metadata ?? {}),
        },
    };
}

function parseAcpInitializeResult(value: unknown): AcpInitializeResult {
    if (!isRecord(value)) {
        throw new Error("ACP initialize result must be an object.");
    }
    if (typeof value.protocolVersion !== "number") {
        throw new Error("ACP initialize result missing protocolVersion.");
    }
    const agentCapabilities = isRecord(value.agentCapabilities)
        ? value.agentCapabilities
        : {};
    return {
        protocolVersion: value.protocolVersion,
        agentCapabilities: agentCapabilities as AcpAgentCapabilities,
        agentInfo: isRecord(value.agentInfo) ? value.agentInfo : undefined,
        authMethods: Array.isArray(value.authMethods)
            ? value.authMethods
            : undefined,
        _meta: isRecord(value._meta) ? value._meta : null,
    };
}

function extractAcpSessionId(value: unknown, method: string): string {
    if (!isRecord(value) || typeof value.sessionId !== "string") {
        throw new Error(`ACP ${method} result missing sessionId.`);
    }
    return value.sessionId;
}

function parseAcpPromptResult(value: unknown): AcpPromptResult {
    return isRecord(value) ? (value as AcpPromptResult) : {};
}

function parseAcpSessionUpdate(value: unknown): AcpSessionUpdateNotification {
    return isRecord(value) ? (value as AcpSessionUpdateNotification) : {};
}

function parseAcpPermissionRequest(value: unknown): AcpRequestPermissionParams {
    return isRecord(value) ? (value as AcpRequestPermissionParams) : {};
}

function extractAcpText(value: unknown): string | null {
    if (!isRecord(value)) {
        return null;
    }
    return typeof value.text === "string" ? value.text : null;
}

function isStableAcpUpdate(update: Record<string, unknown>): boolean {
    const status =
        typeof update.status === "string"
            ? update.status
            : typeof update.state === "string"
              ? update.state
              : null;
    return status
        ? ["completed", "cancelled", "failed", "error"].includes(status)
        : false;
}

function sanitizeAcpMetadata(
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
            .map((item) => sanitizeAcpMetadata(item, depth + 1));
    }
    if (!isRecord(value)) {
        return String(value);
    }

    const metadata: Record<string, RuntimeProviderEventMetadata> = {};
    for (const [key, childValue] of Object.entries(value).slice(0, 50)) {
        metadata[key] = sanitizeAcpMetadata(childValue, depth + 1);
    }
    return metadata;
}

function toEventToken(value: string): string {
    return value
        .replace(/([a-z0-9])([A-Z])/g, "$1.$2")
        .replace(/[^a-zA-Z0-9]+/g, ".")
        .replace(/^\.+|\.+$/g, "")
        .toLowerCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}
