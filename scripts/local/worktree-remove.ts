import fs from "node:fs";
import path from "node:path";

import { loadHostConfig } from "./lib/hostConfig.ts";
import {
    laneStateRootsForCheckout,
    tryLoadLocalManifest,
} from "./lib/manifest.ts";
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

function cleanupLaneState(
    checkoutPath: string,
    manifest: LocalManifest | null,
): void {
    for (const laneStateRoot of laneStateRootsForCheckout(
        checkoutPath,
        manifest,
    )) {
        fs.rmSync(laneStateRoot, { recursive: true, force: true });
    }
}

async function main(): Promise<void> {
    const repoRoot = requireRepoRoot();
    const { input: requestedName, name: worktreeName } = worktreeNameArg();
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
        if (!force) {
            throw new Error(`No git worktree is registered at ${targetPath}.`);
        }

        await stopManagedServicesForCheckoutPath(targetPath);
        updatePortLeases((leases) =>
            removeLeasesForCheckout(leases, targetPath),
        );
        updateProcessRegistry((registry) =>
            removeManagedServicesForCheckout(registry, targetPath),
        );
        cleanupLaneState(
            targetPath,
            tryLoadLocalManifest(targetPath, {
                onError: (error) => {
                    console.warn(
                        `Ignoring invalid manifest during worktree removal: ${error.message}`,
                    );
                },
            }),
        );

        console.log(
            "No git worktree was registered for this path; removed wrapper-managed state only.",
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
        console.log("Force: yes");
        console.log("Branch: unchanged");
        return;
    }

    const manifest = tryLoadLocalManifest(targetPath, {
        onError: (error) => {
            console.warn(
                `Ignoring invalid manifest during worktree removal: ${error.message}`,
            );
        },
    });
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
    cleanupLaneState(targetPath, manifest);

    console.log("Worktree removed.");
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
    console.log(`Force: ${force ? "yes" : "no"}`);
    console.log("Branch: kept");
}

main().catch((error) => {
    console.error(
        error instanceof Error ? error.message : "Worktree removal failed.",
    );
    process.exitCode = 1;
});
