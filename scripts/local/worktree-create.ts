import fs from "node:fs";

import { deriveLaneStateRoot, loadLocalManifest } from "./lib/manifest.ts";
import {
    removeLeasesForCheckout,
    removeManagedServicesForCheckout,
    updatePortLeases,
    updateProcessRegistry,
} from "./lib/registry.ts";
import {
    assertPathAvailable,
    branchExists,
    ensureSafeWorktreeTarget,
    findWorktreeByPath,
    isWorkingTreeDirty,
    normalizeWorktreeName,
    requireRepoRoot,
    resolveWorktreeTargetPath,
    spawnOrThrow,
    validateWorktreeName,
} from "./lib/worktrees.ts";

function worktreeNameArg(): { input: string; name: string } {
    const args = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
    const input = args[0] ?? "";
    return {
        input,
        name: validateWorktreeName(input),
    };
}

function createWorktree(params: {
    repoRoot: string;
    worktreeName: string;
    targetPath: string;
}): { created: boolean; branchAlreadyExisted: boolean } {
    const existing = findWorktreeByPath(params.repoRoot, params.targetPath);
    if (existing) {
        return { created: false, branchAlreadyExisted: true };
    }

    assertPathAvailable(params.targetPath);

    const branchAlreadyExisted = branchExists(
        params.repoRoot,
        params.worktreeName,
    );
    const cmd = branchAlreadyExisted
        ? ["git", "worktree", "add", params.targetPath, params.worktreeName]
        : [
              "git",
              "worktree",
              "add",
              "-b",
              params.worktreeName,
              params.targetPath,
              "HEAD",
          ];

    spawnOrThrow({
        cmd,
        cwd: params.repoRoot,
        label: `git worktree add ${params.worktreeName}`,
    });
    return { created: true, branchAlreadyExisted };
}

function cleanupFailedWorktreeState(targetPath: string): void {
    updatePortLeases((leases) => removeLeasesForCheckout(leases, targetPath));
    updateProcessRegistry((registry) =>
        removeManagedServicesForCheckout(registry, targetPath),
    );
    fs.rmSync(deriveLaneStateRoot(targetPath), {
        recursive: true,
        force: true,
    });
}

function runDoctorSummary(targetPath: string): {
    ok: boolean;
    summary: string;
} {
    const proc = Bun.spawnSync(["bun", "run", "doctor", "--", "--json"], {
        cwd: targetPath,
        stdout: "pipe",
        stderr: "pipe",
    });
    const stdout = proc.stdout.toString().trim();
    const stderr = proc.stderr.toString().trim();

    if (!stdout) {
        return {
            ok: proc.exitCode === 0,
            summary:
                stderr ||
                "Doctor produced no output. Run bun run doctor inside the worktree.",
        };
    }

    try {
        const report = JSON.parse(stdout) as {
            ok?: boolean;
            checks?: Array<{ ok: boolean; label: string; detail: string }>;
        };
        const failingChecks =
            report.checks
                ?.filter((check) => !check.ok)
                .map((check) => `${check.label}: ${check.detail}`) ?? [];
        if (report.ok) {
            return { ok: true, summary: "ok" };
        }
        return {
            ok: false,
            summary:
                failingChecks[0] ??
                stderr ??
                "issues found. Run bun run doctor inside the worktree.",
        };
    } catch {
        return {
            ok: proc.exitCode === 0,
            summary:
                stderr ||
                "Could not parse doctor output. Run bun run doctor inside the worktree.",
        };
    }
}

async function main(): Promise<void> {
    const repoRoot = requireRepoRoot();
    const { input: requestedName, name: worktreeName } = worktreeNameArg();
    const targetPath = resolveWorktreeTargetPath(repoRoot, worktreeName);
    ensureSafeWorktreeTarget(targetPath);

    const existing = findWorktreeByPath(repoRoot, targetPath);
    if (
        !existing &&
        isWorkingTreeDirty(repoRoot) &&
        !process.argv.includes("--allow-dirty")
    ) {
        throw new Error(
            "Refusing to create a worktree from a dirty checkout because uncommitted changes will not be present there. Commit or stash first, or rerun with --allow-dirty if you intentionally want the new worktree to start from HEAD only.",
        );
    }

    const { created, branchAlreadyExisted } = createWorktree({
        repoRoot,
        worktreeName,
        targetPath,
    });

    try {
        spawnOrThrow({
            cmd: ["bun", "install"],
            cwd: targetPath,
            env: {
                ...process.env,
                HUSKY: "0",
            },
            label: `bun install (${worktreeName})`,
        });
        spawnOrThrow({
            cmd: ["bun", "run", "bootstrap", "--", "--no-install"],
            cwd: targetPath,
            label: `bun run bootstrap (${worktreeName})`,
        });
    } catch (error) {
        if (created) {
            spawnOrThrow({
                cmd: ["git", "worktree", "remove", "--force", targetPath],
                cwd: repoRoot,
                label: `cleanup failed worktree ${worktreeName}`,
            });
            if (!branchAlreadyExisted) {
                spawnOrThrow({
                    cmd: ["git", "branch", "-D", worktreeName],
                    cwd: repoRoot,
                    label: `cleanup failed branch ${worktreeName}`,
                });
            }
        }
        if (created) {
            cleanupFailedWorktreeState(targetPath);
        }
        throw error;
    }

    const manifest = loadLocalManifest(targetPath);
    const doctor = runDoctorSummary(targetPath);

    console.log(
        created
            ? "Worktree created."
            : "Worktree already existed; bootstrap refreshed.",
    );
    if (
        requestedName.trim() &&
        normalizeWorktreeName(requestedName) !== requestedName.trim()
    ) {
        console.log(
            `Normalized worktree name: ${requestedName.trim()} -> ${worktreeName}`,
        );
    }
    console.log(`Name: ${worktreeName}`);
    console.log(`Path: ${targetPath}`);
    if (manifest) {
        console.log(`Lane: ${manifest.laneId}`);
        console.log(`Web URL: ${manifest.webUrl}`);
        console.log(`Server URL: ${manifest.serverUrl}`);
    }
    console.log(
        `Doctor: ${doctor.ok ? "ok" : `needs attention (${doctor.summary})`}`,
    );
    if (branchAlreadyExisted) {
        console.log(
            "Note: this worktree reused an existing branch name, so it checked out that branch's current commit instead of cloning the source checkout's latest HEAD.",
        );
    }
    console.log("Next safe commands:");
    console.log(`- cd ${targetPath}`);
    console.log("- bun run status");
    console.log("- bun run doctor");
    console.log(
        doctor.ok ? "- bun run dev" : "- fix doctor issues before bun run dev",
    );
    console.log(`- bun run worktree:remove -- ${worktreeName}`);
    console.log(`Manifest: ${targetPath}/.agentchat/local/manifest.json`);
}

main().catch((error) => {
    console.error(
        error instanceof Error ? error.message : "Worktree creation failed.",
    );
    process.exitCode = 1;
});
