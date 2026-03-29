import fs from "node:fs";
import path from "node:path";

import { loadHostConfig } from "./lib/hostConfig.ts";
import { loadLocalManifest } from "./lib/manifest.ts";
import type { LocalManifest } from "./lib/model.ts";
import {
    stopManagedServices,
    stopManagedServicesForCheckoutPath,
} from "./lib/processes.ts";
import {
    removeLeasesForCheckout,
    removeManagedServicesForCheckout,
    updatePortLeases,
    updateProcessRegistry,
} from "./lib/registry.ts";
import {
    ensureSafeWorktreeTarget,
    findWorktreeByPath,
    requireRepoRoot,
    resolveWorktreeTargetPath,
    spawnOrThrow,
    validateWorktreeName,
} from "./lib/worktrees.ts";

function worktreeNameArg(): string {
    const args = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
    return validateWorktreeName(args[0] ?? "");
}

function cleanupLaneState(manifest: LocalManifest | null): void {
    if (!manifest) {
        return;
    }

    const laneStateRoot = path.dirname(manifest.xdgStateHome);
    fs.rmSync(laneStateRoot, { recursive: true, force: true });
}

async function main(): Promise<void> {
    const repoRoot = requireRepoRoot();
    const worktreeName = worktreeNameArg();
    const targetPath = resolveWorktreeTargetPath(repoRoot, worktreeName);
    const force = process.argv.includes("--force");
    ensureSafeWorktreeTarget(targetPath);

    const hostConfig = loadHostConfig();
    if (
        path.resolve(targetPath) === path.resolve(hostConfig.stableCheckoutPath)
    ) {
        throw new Error(
            "Refusing to remove the stable checkout with worktree commands.",
        );
    }

    const worktree = findWorktreeByPath(repoRoot, targetPath);
    if (!worktree) {
        throw new Error(`No git worktree is registered at ${targetPath}.`);
    }

    const manifest = loadLocalManifest(targetPath);
    if (manifest) {
        await stopManagedServices(manifest);
    } else {
        await stopManagedServicesForCheckoutPath(targetPath);
    }

    const cmd = ["git", "worktree", "remove"];
    if (force) {
        cmd.push("--force");
    }
    cmd.push(targetPath);
    spawnOrThrow({
        cmd,
        cwd: repoRoot,
        label: `git worktree remove ${worktreeName}`,
    });

    updatePortLeases((leases) => removeLeasesForCheckout(leases, targetPath));
    updateProcessRegistry((registry) =>
        removeManagedServicesForCheckout(registry, targetPath),
    );
    cleanupLaneState(manifest);

    console.log("Worktree removed.");
    console.log(`Name: ${worktreeName}`);
    console.log(`Path: ${targetPath}`);
    console.log(`Force: ${force ? "yes" : "no"}`);
}

main().catch((error) => {
    console.error(
        error instanceof Error ? error.message : "Worktree removal failed.",
    );
    process.exitCode = 1;
});
