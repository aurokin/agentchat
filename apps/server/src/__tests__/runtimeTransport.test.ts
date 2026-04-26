import { describe, expect, test } from "bun:test";

import {
    JsonlStreamParser,
    JsonRpcStdioClient,
    ManagedRuntimeProcess,
    type RuntimeProcessExit,
} from "../runtimeTransport.ts";

function createProcess(script: string, stopTimeoutMs = 1_000) {
    return new ManagedRuntimeProcess({
        command: process.execPath,
        args: ["-e", script],
        cwd: process.cwd(),
        env: process.env,
        label: "test process",
        stopTimeoutMs,
    });
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

describe("JsonlStreamParser", () => {
    test("buffers partial JSON lines", () => {
        const values: unknown[] = [];
        const errors: unknown[] = [];
        const parser = new JsonlStreamParser({
            onValue: (value) => values.push(value),
            onError: (error) => errors.push(error),
        });

        parser.push('{"first":');
        parser.push('true}\n\n{"second":2}');
        parser.end();

        expect(values).toEqual([{ first: true }, { second: 2 }]);
        expect(errors).toEqual([]);
    });

    test("reports malformed JSON lines with raw text", () => {
        const values: unknown[] = [];
        const errors: Array<{ line: string }> = [];
        const parser = new JsonlStreamParser({
            onValue: (value) => values.push(value),
            onError: (error) => errors.push({ line: error.line }),
        });

        parser.push("not-json\n");

        expect(values).toEqual([]);
        expect(errors).toEqual([{ line: "not-json" }]);
    });
});

describe("ManagedRuntimeProcess", () => {
    test("captures stderr and reports process exit", async () => {
        const stderrChunks: string[] = [];
        const exits: RuntimeProcessExit[] = [];
        const runtimeProcess = new ManagedRuntimeProcess({
            command: process.execPath,
            args: [
                "-e",
                'process.stderr.write("diagnostic stderr"); process.exit(3);',
            ],
            cwd: process.cwd(),
            env: process.env,
            label: "test process",
            onStderr: (chunk) => stderrChunks.push(chunk),
        });
        runtimeProcess.onExit((exit) => exits.push(exit));

        await waitFor(() => exits.length === 1);

        expect(stderrChunks.join("")).toContain("diagnostic stderr");
        expect(exits[0]).toEqual({
            type: "exit",
            code: 3,
            signal: null,
        });
    });

    test("stops a long-running process with signal escalation", async () => {
        const runtimeProcess = createProcess(
            "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000);",
            50,
        );

        const startedAt = Date.now();
        await runtimeProcess.stop();

        expect(Date.now() - startedAt).toBeLessThan(2_000);
    });
});

describe("JsonRpcStdioClient", () => {
    test("sends requests and receives notifications over stdio", async () => {
        const runtimeProcess = createProcess(`
const readline = require("node:readline");
const rl = readline.createInterface({ input: process.stdin });
rl.on("line", (line) => {
  const message = JSON.parse(line);
  process.stdout.write(JSON.stringify({
    id: message.id,
    result: { ok: true, method: message.method }
  }) + "\\n");
  process.stdout.write(JSON.stringify({
    method: "runtime/update",
    params: { seen: message.method }
  }) + "\\n");
});
setInterval(() => {}, 1000);
`);
        const client = new JsonRpcStdioClient({
            process: runtimeProcess,
            label: "test process",
        });
        const notifications: unknown[] = [];
        client.onNotification((notification) => {
            notifications.push(notification);
        });

        await expect(client.request("ping", {})).resolves.toEqual({
            ok: true,
            method: "ping",
        });
        await waitFor(() => notifications.length === 1);

        expect(notifications[0]).toEqual({
            method: "runtime/update",
            params: { seen: "ping" },
        });

        await runtimeProcess.stop();
    });

    test("rejects pending requests on process exit", async () => {
        const runtimeProcess = createProcess(`
const readline = require("node:readline");
const rl = readline.createInterface({ input: process.stdin });
rl.on("line", () => process.exit(8));
`);
        const client = new JsonRpcStdioClient({
            process: runtimeProcess,
            label: "test process",
        });

        await expect(client.request("hang", {})).rejects.toThrow(
            "test process exited (8 / null)",
        );
    });
});
