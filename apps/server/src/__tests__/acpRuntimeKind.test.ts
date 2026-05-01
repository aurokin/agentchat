import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { AcpRuntimeKind } from "../acpRuntimeKind.ts";
import type { AcpProviderConfig, AgentConfig } from "../config.ts";
import type { RuntimeKindEvent } from "../runtimeKind.ts";

const tempRoots: string[] = [];

function createAgent(overrides: Partial<AgentConfig> = {}): AgentConfig {
    return {
        id: "agent-1",
        name: "Agent 1",
        enabled: true,
        defaultVisible: true,
        visibilityOverrides: [],
        rootPath: process.cwd(),
        providerIds: ["acp-test"],
        defaultProviderId: "acp-test",
        modelAllowlist: [],
        variantAllowlist: [],
        tags: [],
        sortOrder: 0,
        workspaceMode: "shared",
        ...overrides,
    };
}

function createProvider(
    script: string,
    overrides: Partial<AcpProviderConfig["acp"]> = {},
): AcpProviderConfig {
    return {
        id: "acp-test",
        kind: "acp",
        label: "ACP Test",
        enabled: true,
        idleTtlSeconds: 60,
        modelCacheTtlSeconds: 60,
        models: [],
        acp: {
            command: process.execPath,
            args: ["-e", script],
            baseEnv: {},
            mcpServers: [],
            permissionMode: "fail-closed",
            ...overrides,
        },
    };
}

async function waitFor(condition: () => boolean): Promise<void> {
    for (let attempt = 0; attempt < 100; attempt += 1) {
        if (condition()) {
            return;
        }
        await new Promise((resolve) => setTimeout(resolve, 5));
    }

    throw new Error("Timed out waiting for test condition.");
}

function acpScript(params: {
    loadSession?: boolean;
    loadSessionError?: string;
    promptResult?: boolean;
    promptUpdates?: unknown[];
    includeProcessCwdInAgentInfo?: boolean;
}): string {
    return `
const readline = require("node:readline");
const rl = readline.createInterface({ input: process.stdin });
const loadSession = ${JSON.stringify(params.loadSession ?? true)};
const loadSessionError = ${JSON.stringify(params.loadSessionError ?? null)};
const promptResult = ${JSON.stringify(params.promptResult ?? true)};
const promptUpdates = ${JSON.stringify(params.promptUpdates ?? [])};
const includeProcessCwdInAgentInfo = ${JSON.stringify(params.includeProcessCwdInAgentInfo ?? false)};
function send(message) {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", ...message }) + "\\n");
}
rl.on("line", (line) => {
  const message = JSON.parse(line);
  if (message.method === "initialize") {
    send({
      id: message.id,
      result: {
        protocolVersion: 1,
        agentCapabilities: { loadSession },
        agentInfo: {
          name: "fake-acp",
          ...(includeProcessCwdInAgentInfo ? { cwd: process.cwd() } : {})
        }
      }
    });
    return;
  }
  if (message.method === "session/new") {
    send({ id: message.id, result: { sessionId: "acp-session-1" } });
    return;
  }
  if (message.method === "session/load") {
    if (loadSessionError) {
      send({ id: message.id, error: { code: -32000, message: loadSessionError } });
      return;
    }
    send({ id: message.id, result: {} });
    return;
  }
  if (message.method === "session/prompt") {
    for (const update of promptUpdates) {
      send({
        method: "session/update",
        params: { sessionId: message.params.sessionId, update }
      });
    }
    if (promptResult) {
      send({ id: message.id, result: { stopReason: "end_turn" } });
    }
    return;
  }
  if (message.method === "session/cancel") {
    return;
  }
  send({ id: message.id, error: { code: -32601, message: "unknown" } });
});
`;
}

afterEach(() => {
    for (const tempRoot of tempRoots.splice(0)) {
        rmSync(tempRoot, { force: true, recursive: true });
    }
});

describe("AcpRuntimeKind", () => {
    test("starts ACP processes in the agent workspace when provider cwd is omitted", async () => {
        const agentRoot = mkdtempSync(path.join(tmpdir(), "acp-agent-root-"));
        tempRoots.push(agentRoot);
        const session = new AcpRuntimeKind().createSession({
            provider: createProvider(
                acpScript({ includeProcessCwdInAgentInfo: true }),
            ),
            agent: createAgent({ rootPath: agentRoot }),
        });

        const initialize = await session.initialize();
        await session.stop();

        expect(initialize.providerEvents?.[0]?.metadata).toMatchObject({
            agentInfo: {
                cwd: realpathSync(agentRoot),
            },
        });
    });

    test("opens ACP sessions and maps prompt updates into runtime events", async () => {
        const session = new AcpRuntimeKind().createSession({
            provider: createProvider(
                acpScript({
                    promptUpdates: [
                        {
                            sessionUpdate: "agent_message_chunk",
                            content: { type: "text", text: "hello " },
                        },
                        {
                            sessionUpdate: "tool_call",
                            toolCallId: "tool-1",
                            name: "shell",
                        },
                    ],
                }),
            ),
            agent: createAgent(),
        });
        const events: RuntimeKindEvent[] = [];
        session.onEvent((event) => events.push(event));

        const initialize = await session.initialize();
        const opened = await session.openThread({
            bindingProviderId: null,
            bindingThreadId: null,
            providerId: "acp-test",
            modelId: "default",
            cwd: process.cwd(),
        });
        const started = await session.startTurn({
            threadId: opened.threadId,
            inputText: "hello",
            cwd: process.cwd(),
            modelId: "default",
            variantId: "default",
        });

        await waitFor(() =>
            events.some(
                (event) =>
                    event.type === "turn_completed" &&
                    event.status === "completed",
            ),
        );
        await session.stop();

        expect(initialize.providerEvents?.[0]?.eventType).toBe(
            "acp.initialized",
        );
        expect(opened).toMatchObject({
            threadId: "acp-session-1",
            isNew: true,
        });
        expect(started.turnId).toEqual(expect.any(String));
        expect(events).toContainEqual({
            type: "assistant_delta",
            delta: "hello ",
        });
        expect(events).toContainEqual(
            expect.objectContaining({
                type: "provider_event",
                event: expect.objectContaining({
                    eventType: "acp.session.update.tool.call",
                }),
            }),
        );
        expect(events).toContainEqual({
            type: "turn_completed",
            status: "completed",
            errorMessage: undefined,
        });
    });

    test("loads persisted ACP session ids when the agent advertises loadSession", async () => {
        const session = new AcpRuntimeKind().createSession({
            provider: createProvider(acpScript({ loadSession: true })),
            agent: createAgent(),
        });

        await session.initialize();
        const opened = await session.openThread({
            bindingProviderId: "acp-test",
            bindingThreadId: "persisted-session",
            providerId: "acp-test",
            modelId: "default",
            cwd: process.cwd(),
        });
        await session.stop();

        expect(opened).toMatchObject({
            threadId: "persisted-session",
            isNew: false,
        });
        expect(opened.providerEvents?.[0]?.eventType).toBe(
            "acp.session.loaded",
        );
    });

    test("falls back to a fresh ACP session when persisted session load fails", async () => {
        const session = new AcpRuntimeKind().createSession({
            provider: createProvider(
                acpScript({
                    loadSession: true,
                    loadSessionError: "session not found",
                }),
            ),
            agent: createAgent(),
        });

        await session.initialize();
        const opened = await session.openThread({
            bindingProviderId: "acp-test",
            bindingThreadId: "stale-session",
            providerId: "acp-test",
            modelId: "default",
            cwd: process.cwd(),
        });
        await session.stop();

        expect(opened).toMatchObject({
            threadId: "acp-session-1",
            isNew: true,
        });
        expect(opened.providerEvents?.[0]).toMatchObject({
            eventType: "acp.session.load-failed",
            metadata: {
                previousSessionId: "stale-session",
                errorMessage: expect.stringContaining("session not found"),
            },
        });
    });

    test("stops the ACP process when cancel does not settle the prompt", async () => {
        const session = new AcpRuntimeKind().createSession({
            provider: createProvider(
                acpScript({
                    promptResult: false,
                    promptUpdates: [
                        {
                            sessionUpdate: "agent_message_chunk",
                            content: { type: "text", text: "working" },
                        },
                    ],
                }),
                { timeoutMs: 10 },
            ),
            agent: createAgent(),
        });
        const events: RuntimeKindEvent[] = [];
        session.onEvent((event) => events.push(event));

        await session.initialize();
        const opened = await session.openThread({
            bindingProviderId: null,
            bindingThreadId: null,
            providerId: "acp-test",
            modelId: "default",
            cwd: process.cwd(),
        });
        const started = await session.startTurn({
            threadId: opened.threadId,
            inputText: "stop",
            cwd: process.cwd(),
            modelId: "default",
            variantId: "default",
        });
        await session.interruptTurn({
            threadId: opened.threadId,
            turnId: started.turnId,
        });

        await waitFor(() =>
            events.some(
                (event) =>
                    event.type === "turn_completed" &&
                    event.status === "interrupted",
            ),
        );

        expect(events).toContainEqual(
            expect.objectContaining({
                type: "provider_event",
                event: expect.objectContaining({
                    eventType: "acp.session.cancel.sent",
                }),
            }),
        );
        expect(events).toContainEqual({
            type: "turn_completed",
            status: "interrupted",
            errorMessage: undefined,
        });
    });

    test("reports hung ACP prompts as timeout failures", async () => {
        const session = new AcpRuntimeKind().createSession({
            provider: createProvider(
                acpScript({
                    promptResult: false,
                    promptUpdates: [
                        {
                            sessionUpdate: "agent_message_chunk",
                            content: { type: "text", text: "working" },
                        },
                    ],
                }),
                { timeoutMs: 10 },
            ),
            agent: createAgent(),
        });
        const events: RuntimeKindEvent[] = [];
        session.onEvent((event) => events.push(event));

        await session.initialize();
        const opened = await session.openThread({
            bindingProviderId: null,
            bindingThreadId: null,
            providerId: "acp-test",
            modelId: "default",
            cwd: process.cwd(),
        });
        await session.startTurn({
            threadId: opened.threadId,
            inputText: "timeout",
            cwd: process.cwd(),
            modelId: "default",
            variantId: "default",
        });

        await waitFor(() =>
            events.some(
                (event) =>
                    event.type === "turn_completed" &&
                    event.status === "errored",
            ),
        );

        expect(events).toContainEqual(
            expect.objectContaining({
                type: "provider_event",
                event: expect.objectContaining({
                    eventType: "acp.session.prompt.timed-out",
                }),
            }),
        );
        expect(events).toContainEqual({
            type: "turn_completed",
            status: "errored",
            errorMessage: "ACP prompt timed out after 10ms.",
        });
    });
});
