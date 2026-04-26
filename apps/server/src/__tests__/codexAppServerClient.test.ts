import { afterEach, describe, expect, mock, test } from "bun:test";

import {
    CodexAppServerClient,
    type CodexClient,
} from "../codexAppServerClient.ts";
import type { AgentConfig, ProviderConfig } from "../config.ts";

const clients: CodexClient[] = [];

function createProvider(args: string[]): ProviderConfig {
    return {
        id: "codex-test",
        kind: "codex",
        label: "Codex Test",
        enabled: true,
        idleTtlSeconds: 60,
        modelCacheTtlSeconds: 60,
        models: [],
        codex: {
            command: process.execPath,
            args,
            baseEnv: {},
            cwd: process.cwd(),
        },
    };
}

function createAgent(): AgentConfig {
    return {
        id: "agent-1",
        name: "Agent 1",
        enabled: true,
        defaultVisible: true,
        visibilityOverrides: [],
        rootPath: process.cwd(),
        providerIds: ["codex-test"],
        defaultProviderId: "codex-test",
        modelAllowlist: [],
        variantAllowlist: [],
        tags: [],
        sortOrder: 0,
        workspaceMode: "shared",
    };
}

function createClient(
    script: string,
    stopTimeoutMs = 1_000,
): CodexAppServerClient {
    const client = new CodexAppServerClient({
        provider: createProvider(["-e", script]),
        agent: createAgent(),
        stopTimeoutMs,
    });
    clients.push(client);
    return client;
}

async function waitFor(condition: () => boolean): Promise<void> {
    for (let attempt = 0; attempt < 100; attempt += 1) {
        if (condition()) {
            return;
        }
        await new Promise((resolve) => setTimeout(resolve, 0));
    }

    throw new Error("Timed out waiting for test condition.");
}

afterEach(async () => {
    const activeClients = clients.splice(0);
    await Promise.allSettled(activeClients.map((client) => client.stop()));
});

describe("CodexAppServerClient", () => {
    test("resolves JSON-RPC request responses", async () => {
        const client = createClient(`
const readline = require("node:readline");
const rl = readline.createInterface({ input: process.stdin });
rl.on("line", (line) => {
  const message = JSON.parse(line);
  process.stdout.write(JSON.stringify({
    id: message.id,
    result: { method: message.method, params: message.params }
  }) + "\\n");
});
setInterval(() => {}, 1000);
`);

        await expect(client.request("ping", { value: 42 })).resolves.toEqual({
            method: "ping",
            params: { value: 42 },
        });
    });

    test("rejects JSON-RPC error responses", async () => {
        const client = createClient(`
const readline = require("node:readline");
const rl = readline.createInterface({ input: process.stdin });
rl.on("line", (line) => {
  const message = JSON.parse(line);
  process.stdout.write(JSON.stringify({
    id: message.id,
    error: { message: "request failed" }
  }) + "\\n");
});
setInterval(() => {}, 1000);
`);

        await expect(client.request("fail", {})).rejects.toThrow(
            "request failed",
        );
    });

    test("delivers JSON-RPC notifications", async () => {
        const client = createClient(`
setTimeout(() => {
  process.stdout.write(JSON.stringify({
    method: "codex/event/test",
    params: { ok: true }
  }) + "\\n");
}, 0);
setInterval(() => {}, 1000);
`);
        const notifications: unknown[] = [];
        client.onNotification((notification) => {
            notifications.push(notification);
        });

        await waitFor(() => notifications.length === 1);

        expect(notifications[0]).toEqual({
            method: "codex/event/test",
            params: { ok: true },
        });
    });

    test("logs invalid JSON without closing the client", async () => {
        const consoleError = mock(() => undefined);
        const originalConsoleError = console.error;
        console.error = consoleError as typeof console.error;
        try {
            const client = createClient(`
process.stdout.write("not-json\\n");
setInterval(() => {}, 1000);
`);

            await waitFor(() => consoleError.mock.calls.length > 0);
            const calls = consoleError.mock.calls as unknown[][];
            expect(calls[0]?.[0]).toBe("[agentchat-server] invalid codex JSON");

            await client.stop();
        } finally {
            console.error = originalConsoleError;
        }
    });

    test("rejects pending requests when the child exits", async () => {
        const client = createClient(`
const readline = require("node:readline");
const rl = readline.createInterface({ input: process.stdin });
rl.on("line", () => {
  process.exit(7);
});
`);

        await expect(client.request("hang", {})).rejects.toThrow(
            "Codex app-server exited (7 / null)",
        );
    });

    test("falls back to SIGKILL when the child ignores SIGTERM", async () => {
        const client = createClient(
            "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000);",
            50,
        );

        const startedAt = Date.now();
        await client.stop();

        expect(Date.now() - startedAt).toBeLessThan(2_000);
    });
});
