import path from "node:path";

import {
    isWorkingTreeDirty,
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

async function main(): Promise<void> {
    const repoRoot = requireRepoRoot();
    const requestedName = smokeName();
    const allowDirty =
        process.argv.includes("--allow-dirty") || isWorkingTreeDirty(repoRoot);
    let created = false;
    let name = requestedName;
    let targetPath = resolveWorktreeTargetPath(repoRoot, name);

    try {
        const maxAttempts = process.argv
            .slice(2)
            .find((arg) => arg.startsWith("--max-attempts="));
        const maxAttemptsCount = maxAttempts
            ? Number.parseInt(maxAttempts.split("=", 2)[1] ?? "5", 10)
            : 5;

        for (let attempt = 0; attempt < maxAttemptsCount; attempt += 1) {
            name =
                attempt === 0
                    ? requestedName
                    : `${requestedName}-${attempt + 1}`;
            targetPath = resolveWorktreeTargetPath(repoRoot, name);
            const createArgs = ["bun", "run", "worktree:create", "--", name];
            if (allowDirty) {
                createArgs.push("--allow-dirty");
            }
            if (allowDirty) {
                console.log(
                    "Worktree lifecycle smoke is allowing a dirty source checkout.",
                );
            }

            try {
                runOrThrow({
                    cmd: createArgs,
                    cwd: repoRoot,
                });
                created = true;
                break;
            } catch (error) {
                const message =
                    error instanceof Error ? error.message : String(error);
                if (
                    attempt + 1 < maxAttemptsCount &&
                    !process.argv
                        .slice(2)
                        .some((arg) => !arg.startsWith("--")) &&
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

        if (!created) {
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
            runOrThrow({
                cmd: ["bun", "run", "dev"],
                cwd: targetPath,
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
    } finally {
        if (created) {
            runOrThrow({
                cmd: ["bun", "run", "worktree:remove", "--", name, "--force"],
                cwd: repoRoot,
                allowFailure: true,
            });
        }
        runOrThrow({
            cmd: ["bun", "run", "worktree:gc", "--", "--dry-run"],
            cwd: repoRoot,
            allowFailure: true,
        });
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
