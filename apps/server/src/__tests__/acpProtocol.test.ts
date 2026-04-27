import { describe, expect, test } from "bun:test";

import {
    AcpProtocolClient,
    mapAcpNotificationToRuntimeEvents,
    resolveAcpPermissionRequest,
    type AcpJsonRpcTransport,
} from "../acpProtocol.ts";
import type {
    RuntimeJsonRpcNotification,
    RuntimeJsonRpcRequest,
} from "../runtimeTransport.ts";

class FakeAcpTransport implements AcpJsonRpcTransport {
    readonly requests: Array<{ method: string; params: unknown }> = [];
    readonly notifications: Array<{ method: string; params: unknown }> = [];
    private readonly responses = new Map<string, unknown>();
    private notificationHandler:
        | ((notification: RuntimeJsonRpcNotification) => void)
        | null = null;
    private requestHandler:
        | ((request: RuntimeJsonRpcRequest) => Promise<unknown> | unknown)
        | null = null;

    setResponse(method: string, result: unknown): void {
        this.responses.set(method, result);
    }

    async request(method: string, params: unknown): Promise<unknown> {
        this.requests.push({ method, params });
        if (!this.responses.has(method)) {
            throw new Error(`Missing fake ACP response for ${method}.`);
        }
        return this.responses.get(method);
    }

    notify(method: string, params: unknown): void {
        this.notifications.push({ method, params });
    }

    onNotification(
        handler: (notification: RuntimeJsonRpcNotification) => void,
    ): void {
        this.notificationHandler = handler;
    }

    onRequest(
        handler: (request: RuntimeJsonRpcRequest) => Promise<unknown> | unknown,
    ): void {
        this.requestHandler = handler;
    }

    emitNotification(notification: RuntimeJsonRpcNotification): void {
        this.notificationHandler?.(notification);
    }

    async emitRequest(request: RuntimeJsonRpcRequest): Promise<unknown> {
        if (!this.requestHandler) {
            throw new Error("No fake ACP request handler registered.");
        }
        return await this.requestHandler(request);
    }
}

function createInitializedClient(
    params: {
        loadSession?: boolean;
        permissionMode?: "auto-approve" | "fail-closed";
    } = {},
) {
    const transport = new FakeAcpTransport();
    transport.setResponse("initialize", {
        protocolVersion: 1,
        agentCapabilities: {
            loadSession: params.loadSession ?? false,
            sessionCapabilities: {
                resume: {},
                close: {},
            },
        },
        agentInfo: {
            name: "fake-acp",
        },
        authMethods: [],
    });
    const client = new AcpProtocolClient({
        transport,
        permissionMode: params.permissionMode,
    });
    return { client, transport };
}

describe("AcpProtocolClient", () => {
    test("initializes and captures advertised capabilities", async () => {
        const { client, transport } = createInitializedClient({
            loadSession: true,
        });

        const result = await client.initialize();

        expect(result.agentCapabilities.loadSession).toBe(true);
        expect(result.agentCapabilities.sessionCapabilities?.resume).toEqual(
            {},
        );
        expect(transport.requests[0]).toMatchObject({
            method: "initialize",
            params: {
                protocolVersion: 1,
                clientCapabilities: {},
            },
        });
    });

    test("rejects unsupported protocol versions during initialization", async () => {
        const transport = new FakeAcpTransport();
        transport.setResponse("initialize", {
            protocolVersion: 2,
            agentCapabilities: {},
        });
        const client = new AcpProtocolClient({ transport });

        await expect(client.initialize()).rejects.toThrow(
            "Unsupported ACP protocol version 2; expected 1.",
        );
        expect(client.capabilities).toBeNull();
    });

    test("creates new sessions and extracts session ids", async () => {
        const { client, transport } = createInitializedClient();
        transport.setResponse("session/new", { sessionId: "session-new" });

        const sessionId = await client.newSession({
            cwd: "/tmp/project",
            mcpServers: [],
        });

        expect(sessionId).toBe("session-new");
        expect(transport.requests[0]).toEqual({
            method: "session/new",
            params: {
                cwd: "/tmp/project",
                mcpServers: [],
            },
        });
    });

    test("gates session/load on advertised capability", async () => {
        const { client, transport } = createInitializedClient({
            loadSession: false,
        });
        await client.initialize();
        transport.setResponse("session/load", null);

        await expect(
            client.loadSession({
                sessionId: "session-1",
                cwd: "/tmp/project",
                mcpServers: [],
            }),
        ).rejects.toThrow("ACP agent does not advertise loadSession.");
        expect(
            transport.requests.some(
                (request) => request.method === "session/load",
            ),
        ).toBe(false);
    });

    test("loads sessions when the capability is advertised", async () => {
        const { client, transport } = createInitializedClient({
            loadSession: true,
        });
        await client.initialize();
        transport.setResponse("session/load", null);

        await client.loadSession({
            sessionId: "session-1",
            cwd: "/tmp/project",
            mcpServers: [],
        });

        expect(transport.requests.at(-1)).toEqual({
            method: "session/load",
            params: {
                sessionId: "session-1",
                cwd: "/tmp/project",
                mcpServers: [],
            },
        });
    });

    test("prompts with text content and maps cancelled stop reasons", async () => {
        const { client, transport } = createInitializedClient();
        transport.setResponse("session/prompt", { stopReason: "cancelled" });

        const outcome = await client.prompt({
            sessionId: "session-1",
            text: "Continue",
        });

        expect(transport.requests[0]).toEqual({
            method: "session/prompt",
            params: {
                sessionId: "session-1",
                prompt: [{ type: "text", text: "Continue" }],
            },
        });
        expect(outcome.events.map((event) => event.type)).toEqual([
            "provider_event",
            "turn_aborted",
        ]);
    });

    test("sends session/cancel notifications", () => {
        const { client, transport } = createInitializedClient();

        client.cancel({ sessionId: "session-1" });

        expect(transport.notifications).toEqual([
            {
                method: "session/cancel",
                params: { sessionId: "session-1" },
            },
        ]);
    });

    test("handles permission requests with fail-closed outcome", async () => {
        const { client, transport } = createInitializedClient();
        const events: unknown[] = [];
        client.onEvent((event) => events.push(event));

        const outcome = await transport.emitRequest({
            id: 1,
            method: "session/request_permission",
            params: {
                sessionId: "session-1",
                options: [{ optionId: "allow-once", kind: "allow_once" }],
            },
        });

        expect(outcome).toEqual({ outcome: { outcome: "cancelled" } });
        expect(events).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    type: "permission_request",
                    outcome: { outcome: "cancelled" },
                }),
            ]),
        );
    });

    test("can auto-select a safe permission option when configured", async () => {
        const { client, transport } = createInitializedClient({
            permissionMode: "auto-approve",
        });

        const outcome = await transport.emitRequest({
            id: 1,
            method: "session/request_permission",
            params: {
                sessionId: "session-1",
                options: [{ optionId: "allow-once", kind: "allow_once" }],
            },
        });

        expect(outcome).toEqual({
            outcome: {
                outcome: "selected",
                optionId: "allow-once",
            },
        });
    });

    test("prefers one-shot permission approvals in auto-approve mode", async () => {
        const { client, transport } = createInitializedClient({
            permissionMode: "auto-approve",
        });

        const outcome = await transport.emitRequest({
            id: 1,
            method: "session/request_permission",
            params: {
                sessionId: "session-1",
                options: [
                    { optionId: "allow-always", kind: "allow_always" },
                    { optionId: "allow-once", kind: "allow_once" },
                ],
            },
        });

        expect(outcome).toEqual({
            outcome: {
                outcome: "selected",
                optionId: "allow-once",
            },
        });
    });

    test("does not auto-select persistent permission approvals", async () => {
        const { client, transport } = createInitializedClient({
            permissionMode: "auto-approve",
        });

        const outcome = await transport.emitRequest({
            id: 1,
            method: "session/request_permission",
            params: {
                sessionId: "session-1",
                options: [{ optionId: "allow-always", kind: "allow_always" }],
            },
        });

        expect(outcome).toEqual({ outcome: { outcome: "cancelled" } });
    });

    test("reports unsupported client requests as method-not-found", async () => {
        const { client, transport } = createInitializedClient();
        void client;

        await expect(
            transport.emitRequest({
                id: 1,
                method: "session/elicitation",
                params: { sessionId: "session-1" },
            }),
        ).rejects.toMatchObject({
            code: -32601,
            message: "Unsupported ACP request 'session/elicitation'.",
        });
    });
});

describe("ACP event mapping", () => {
    test("maps agent text chunks to assistant deltas", () => {
        expect(
            mapAcpNotificationToRuntimeEvents({
                method: "session/update",
                params: {
                    sessionId: "session-1",
                    update: {
                        sessionUpdate: "agent_message_chunk",
                        content: { type: "text", text: "Hello" },
                    },
                },
            }),
        ).toEqual([{ type: "assistant_delta", delta: "Hello" }]);
    });

    test("preserves non-text agent message chunks as provider artifacts", () => {
        expect(
            mapAcpNotificationToRuntimeEvents({
                method: "session/update",
                params: {
                    sessionId: "session-1",
                    update: {
                        sessionUpdate: "agent_message_chunk",
                        content: {
                            type: "image",
                            data: "base64-data",
                            mimeType: "image/png",
                        },
                    },
                },
            }),
        ).toEqual([
            expect.objectContaining({
                type: "provider_event",
                event: expect.objectContaining({
                    eventType: "acp.session.update.agent_message_chunk",
                    providerKind: "acp",
                    metadata: expect.objectContaining({
                        updateKind: "agent_message_chunk",
                        update: expect.objectContaining({
                            content: expect.objectContaining({
                                type: "image",
                                data: "base64-data",
                                mimeType: "image/png",
                            }),
                        }),
                    }),
                }),
            }),
        ]);
    });

    test("preserves plan and tool updates as provider artifacts", () => {
        const events = mapAcpNotificationToRuntimeEvents({
            method: "session/update",
            params: {
                sessionId: "session-1",
                update: {
                    sessionUpdate: "tool_call",
                    toolCallId: "tool-1",
                    status: "pending",
                },
            },
        });

        expect(events).toEqual([
            {
                type: "provider_event",
                event: expect.objectContaining({
                    providerKind: "acp",
                    eventType: "acp.session.update.tool.call",
                    phase: "artifact",
                    stable: false,
                    metadata: expect.objectContaining({
                        updateKind: "tool_call",
                    }),
                }),
            },
        ]);
    });

    test("preserves unknown updates as provider artifacts", () => {
        const events = mapAcpNotificationToRuntimeEvents({
            method: "session/update",
            params: {
                sessionId: "session-1",
                update: {
                    sessionUpdate: "future_update",
                    payload: { value: 1 },
                },
            },
        });

        expect(events[0]).toEqual({
            type: "provider_event",
            event: expect.objectContaining({
                eventType: "acp.session.update.future.update",
                metadata: expect.objectContaining({
                    updateKind: "future_update",
                    update: expect.objectContaining({
                        payload: { value: 1 },
                    }),
                }),
            }),
        });
    });

    test("resolves permissions conservatively by default", () => {
        expect(
            resolveAcpPermissionRequest(
                {
                    options: [{ optionId: "allow-once", kind: "allow_once" }],
                },
                "fail-closed",
            ),
        ).toEqual({ outcome: "cancelled" });
    });

    test("resolves auto-approved permissions without persistent approval", () => {
        expect(
            resolveAcpPermissionRequest(
                {
                    options: [
                        { optionId: "allow-always", kind: "allow_always" },
                        { optionId: "allow-once", kind: "allow_once" },
                    ],
                },
                "auto-approve",
            ),
        ).toEqual({ outcome: "selected", optionId: "allow-once" });
        expect(
            resolveAcpPermissionRequest(
                {
                    options: [
                        { optionId: "allow-always", kind: "allow_always" },
                    ],
                },
                "auto-approve",
            ),
        ).toEqual({ outcome: "cancelled" });
    });
});
