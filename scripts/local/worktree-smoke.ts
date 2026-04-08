import path from "node:path";
import { spawn } from "node:child_process";

import {
    findWorktreeByPath,
    isWorkingTreeDirty,
    normalizeWorktreeName,
    requireRepoRoot,
    resolveWorktreeTargetPath,
} from "./lib/worktrees.ts";

function runOrThrow(params: {
    cmd: string[];
    cwd: string;
    allowFailure?: boolean;
}): { stdout: string; stderr: string; exitCode: number } {
    const proc = Bun.spawnSync(params.cmd, {
        cwd: params.cwd,
        stdout: "pipe",
        stderr: "pipe",
        env: process.env,
    });
    const stdout = proc.stdout.toString();
    const stderr = proc.stderr.toString();
    if (!params.allowFailure && proc.exitCode !== 0) {
        throw new Error(
            [
                `Command failed: ${params.cmd.join(" ")}`,
                stdout.trim(),
                stderr.trim(),
            ]
                .filter(Boolean)
                .join("\n"),
        );
    }
    return {
        stdout,
        stderr,
        exitCode: proc.exitCode,
    };
}

async function runOrThrowWithTimeout(params: {
    cmd: string[];
    cwd: string;
    timeoutMs: number;
    allowFailure?: boolean;
}): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return await new Promise((resolve, reject) => {
        const child = spawn(params.cmd[0] ?? "", params.cmd.slice(1), {
            cwd: params.cwd,
            env: process.env,
            stdio: ["ignore", "pipe", "pipe"],
        });

        let stdout = "";
        let stderr = "";
        let timedOut = false;
        let settled = false;

        child.stdout?.on("data", (chunk: Buffer | string) => {
            const text = chunk.toString();
            stdout += text;
            process.stdout.write(text);
        });
        child.stderr?.on("data", (chunk: Buffer | string) => {
            const text = chunk.toString();
            stderr += text;
            process.stderr.write(text);
        });

        const finalize = (
            error: Error | null,
            exitCode = 0,
            signal: NodeJS.Signals | null = null,
        ) => {
            if (settled) {
                return;
            }
            settled = true;
            clearTimeout(timeoutId);
            if (error) {
                reject(error);
                return;
            }
            if (timedOut) {
                reject(
                    new Error(
                        `Command timed out after ${params.timeoutMs}ms: ${params.cmd.join(" ")}`,
                    ),
                );
                return;
            }
            if (!params.allowFailure && (exitCode !== 0 || signal)) {
                reject(
                    new Error(
                        [
                            `Command failed: ${params.cmd.join(" ")}`,
                            stdout.trim(),
                            stderr.trim(),
                        ]
                            .filter(Boolean)
                            .join("\n"),
                    ),
                );
                return;
            }
            resolve({
                stdout,
                stderr,
                exitCode,
            });
        };

        const timeoutId = setTimeout(() => {
            timedOut = true;
            child.kill("SIGTERM");
            setTimeout(() => {
                if (!settled) {
                    child.kill("SIGKILL");
                }
            }, 2000).unref();
        }, params.timeoutMs);
        timeoutId.unref();

        child.once("error", (error) => finalize(error));
        child.once("close", (code, signal) =>
            finalize(null, code ?? 0, signal),
        );
    });
}

function smokeName(): string {
    const explicit = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
    if (explicit) {
        return explicit;
    }
    return `worktree-smoke-${Date.now()}`;
}

function isPortCollisionError(message: string): boolean {
    return (
        message.includes("Preferred web port") ||
        message.includes("Preferred server port")
    );
}

function toError(error: unknown, fallbackMessage: string): Error {
    return error instanceof Error ? error : new Error(fallbackMessage);
}

async function main(): Promise<void> {
    const repoRoot = requireRepoRoot();
    const requestedName = smokeName();
    const explicitNameProvided = process.argv
        .slice(2)
        .some((arg) => !arg.startsWith("--"));
    const allowDirty =
        process.argv.includes("--allow-dirty") || isWorkingTreeDirty(repoRoot);
    if (allowDirty) {
        console.log(
            "Worktree lifecycle smoke is allowing a dirty source checkout.",
        );
    }
    let availableForTeardown = false;
    let createdByThisRun = false;
    let name = normalizeWorktreeName(requestedName) || requestedName;
    let targetPath = resolveWorktreeTargetPath(repoRoot, name);
    let failure: Error | null = null;

    try {
        const maxAttempts = process.argv
            .slice(2)
            .find((arg) => arg.startsWith("--max-attempts="));
        const maxAttemptsCount = maxAttempts
            ? Number.parseInt(maxAttempts.split("=", 2)[1] ?? "5", 10)
            : 5;

        for (let attempt = 0; attempt < maxAttemptsCount; attempt += 1) {
            const rawAttemptName =
                attempt === 0
                    ? requestedName
                    : `${requestedName}-${attempt + 1}`;
            name = normalizeWorktreeName(rawAttemptName) || rawAttemptName;
            targetPath = resolveWorktreeTargetPath(repoRoot, name);
            const createArgs = ["bun", "run", "worktree:create", "--", name];
            if (allowDirty) {
                createArgs.push("--allow-dirty");
            }

            try {
                const worktreeAlreadyExisted =
                    findWorktreeByPath(repoRoot, targetPath) !== null;
                runOrThrow({
                    cmd: createArgs,
                    cwd: repoRoot,
                });
                availableForTeardown = true;
                createdByThisRun = !worktreeAlreadyExisted;
                break;
            } catch (error) {
                const message =
                    error instanceof Error ? error.message : String(error);
                if (
                    attempt + 1 < maxAttemptsCount &&
                    !explicitNameProvided &&
                    isPortCollisionError(message)
                ) {
                    console.log(
                        `Retrying lifecycle smoke with a new generated name after port collision for ${name}.`,
                    );
                    continue;
                }
                throw error;
            }
        }

        if (!availableForTeardown) {
            throw new Error("Failed to create a smoke worktree.");
        }

        runOrThrow({
            cmd: ["bun", "run", "status"],
            cwd: targetPath,
        });

        const doctor = runOrThrow({
            cmd: ["bun", "run", "doctor", "--", "--json"],
            cwd: targetPath,
            allowFailure: true,
        });
        const doctorOk = doctor.exitCode === 0;

        if (doctorOk) {
            await runOrThrowWithTimeout({
                cmd: ["bun", "run", "dev"],
                cwd: targetPath,
                timeoutMs: 30_000,
            });
            runOrThrow({
                cmd: ["bun", "run", "stop"],
                cwd: targetPath,
            });
        } else {
            console.log(
                "Doctor reported issues in the smoke worktree; skipped dev/stop and continued teardown.",
            );
        }
    } catch (error) {
        failure = toError(error, "Worktree lifecycle smoke failed.");
    } finally {
        let teardownFailure: Error | null = null;
        if (createdByThisRun) {
            try {
                runOrThrow({
                    cmd: [
                        "bun",
                        "run",
                        "worktree:remove",
                        "--",
                        name,
                        "--force",
                    ],
                    cwd: repoRoot,
                });
            } catch (error) {
                teardownFailure = toError(
                    error,
                    "Failed to tear down the smoke worktree.",
                );
            }
        } else if (availableForTeardown) {
            console.log(
                "Smoke used an existing worktree; skipping teardown to avoid deleting a pre-existing checkout.",
            );
        }
        runOrThrow({
            cmd: ["bun", "run", "worktree:gc", "--", "--dry-run"],
            cwd: repoRoot,
            allowFailure: true,
        });

        if (teardownFailure) {
            if (failure) {
                throw new AggregateError(
                    [failure, teardownFailure],
                    "Worktree lifecycle smoke failed and teardown also failed.",
                );
            }
            throw teardownFailure;
        }
        if (failure) {
            throw failure;
        }
    }

    console.log("Worktree lifecycle smoke complete.");
    console.log(`Name: ${name}`);
    console.log(`Path: ${path.resolve(targetPath)}`);
}

main().catch((error) => {
    console.error(
        error instanceof Error
            ? error.message
            : "Worktree lifecycle smoke failed.",
    );
    process.exitCode = 1;
});
