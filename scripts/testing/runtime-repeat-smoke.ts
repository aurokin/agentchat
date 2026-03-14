import { spawnSync } from "node:child_process";

import { parseRuntimeRepeatSmokeArgs } from "./runtime-repeat-smoke-helpers";

type AttemptResult = {
    attempt: number;
    ok: boolean;
    durationMs: number;
    stdout: string;
    stderr: string;
    exitCode: number | null;
};

function trimOutput(value: string): string {
    return value.trim();
}

async function main() {
    const args = parseRuntimeRepeatSmokeArgs(process.argv.slice(2));
    const results: AttemptResult[] = [];
    const scriptArgs = ["scripts/testing/live-runtime-smoke.ts", "--mode", "smoke"];
    if (args.serverUrl) {
        scriptArgs.push("--server-url", args.serverUrl);
    }

    for (let attempt = 1; attempt <= args.iterations; attempt += 1) {
        const startedAt = Date.now();
        const result = spawnSync("bun", scriptArgs, {
            cwd: process.cwd(),
            encoding: "utf8",
        });
        const durationMs = Date.now() - startedAt;
        const attemptResult: AttemptResult = {
            attempt,
            ok: result.status === 0,
            durationMs,
            stdout: trimOutput(result.stdout ?? ""),
            stderr: trimOutput(result.stderr ?? ""),
            exitCode: result.status,
        };
        results.push(attemptResult);

        console.log(
            JSON.stringify(
                {
                    attempt,
                    ok: attemptResult.ok,
                    durationMs,
                    exitCode: attemptResult.exitCode,
                },
                null,
                2,
            ),
        );

        if (!attemptResult.ok && !args.keepGoing) {
            break;
        }
    }

    const failures = results.filter((result) => !result.ok);
    console.log(
        JSON.stringify(
            {
                ok: failures.length === 0,
                iterations: args.iterations,
                completedAttempts: results.length,
                failures: failures.map((result) => ({
                    attempt: result.attempt,
                    durationMs: result.durationMs,
                    exitCode: result.exitCode,
                    stdout: result.stdout,
                    stderr: result.stderr,
                })),
            },
            null,
            2,
        ),
    );

    if (failures.length > 0) {
        process.exit(1);
    }
}

try {
    await main();
} catch (error) {
    console.error(
        error instanceof Error
            ? error.message
            : "Runtime repeat smoke failed unexpectedly.",
    );
    process.exit(1);
}
