// Integration tests for ManagedRuntimeProcess. ManagedRuntimeProcess
// wraps node:child_process.spawn — there is no meaningful unit test of it
// without spawning a real subprocess (the test would just exercise the
// fake). These tests live outside src/__tests__ so the unit suite
// (`bun run test`) stays subprocess-free; run them with
// `bun run test:integration`.

import { describe, expect, test } from "bun:test";

import {
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
    const deadline = Date.now() + 2_000;
    while (!condition()) {
        if (Date.now() > deadline) {
            throw new Error("Timed out waiting for test condition.");
        }
        await new Promise((resolve) => setImmediate(resolve));
    }
}

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

    test("uses a custom graceful stop signal before force escalation", async () => {
        const stderrChunks: string[] = [];
        const exits: RuntimeProcessExit[] = [];
        const runtimeProcess = new ManagedRuntimeProcess({
            command: process.execPath,
            args: [
                "-e",
                [
                    "process.on('SIGINT', () => { process.stderr.write('saw SIGINT'); });",
                    "process.on('SIGTERM', () => process.exit(7));",
                    "process.stderr.write('ready');",
                    "setInterval(() => {}, 1000);",
                ].join(" "),
            ],
            cwd: process.cwd(),
            env: process.env,
            label: "test process",
            stopTimeoutMs: 50,
            stopPolicy: {
                gracefulSignal: "SIGINT",
                forceSignal: "SIGTERM",
            },
            onStderr: (chunk) => stderrChunks.push(chunk),
        });
        runtimeProcess.onExit((exit) => exits.push(exit));

        await waitFor(() => stderrChunks.join("").includes("ready"));
        await runtimeProcess.stop();

        expect(stderrChunks.join("")).toContain("saw SIGINT");
        expect(exits[0]).toEqual({
            type: "exit",
            code: 7,
            signal: null,
        });
    });
});
