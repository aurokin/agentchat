import fs from "node:fs";
import path from "node:path";

import { loadHostConfig } from "./lib/hostConfig.ts";
import { deriveLaneStateRoot, loadLocalManifest } from "./lib/manifest.ts";
import { stopManagedServicesForCheckoutPath } from "./lib/processes.ts";
import {
    loadPortLeases,
    loadProcessRegistry,
    removeLeasesForCheckout,
    removeManagedServicesForCheckout,
    updatePortLeases,
    updateProcessRegistry,
} from "./lib/registry.ts";
import {
    listGitWorktrees,
    requireRepoRoot,
    resolveWorktreeParent,
} from "./lib/worktrees.ts";

function tryLoadLocalManifest(checkoutPath: string) {
    try {
        return loadLocalManifest(checkoutPath);
    } catch {
        return null;
    }
}

function laneStateRootsForCheckout(checkoutPath: string): string[] {
    const roots = new Set<string>([deriveLaneStateRoot(checkoutPath)]);
    const manifest = tryLoadLocalManifest(checkoutPath);
    if (manifest) {
        roots.add(path.dirname(manifest.xdgStateHome));
    }
    return [...roots];
}

function isManagedSiblingWorktreePath(params: {
    checkoutPath: string;
    worktreeParent: string;
}): boolean {
    return path.dirname(params.checkoutPath) === params.worktreeParent;
}

function isStaleManagedCheckoutPath(params: {
    checkoutPath: string;
    stableCheckoutPath: string;
    activeWorktreePaths: Set<string>;
    worktreeParent: string;
}): boolean {
    const resolvedCheckoutPath = path.resolve(params.checkoutPath);
    if (resolvedCheckoutPath === params.stableCheckoutPath) {
        return false;
    }
    if (params.activeWorktreePaths.has(resolvedCheckoutPath)) {
        return false;
    }
    if (!fs.existsSync(resolvedCheckoutPath)) {
        return true;
    }
    return isManagedSiblingWorktreePath({
        checkoutPath: resolvedCheckoutPath,
        worktreeParent: params.worktreeParent,
    });
}

function collectManagedSiblingManifestPaths(params: {
    worktreeParent: string;
    stableCheckoutPath: string;
    activeWorktreePaths: Set<string>;
}): string[] {
    if (!fs.existsSync(params.worktreeParent)) {
        return [];
    }

    return fs
        .readdirSync(params.worktreeParent, {
            withFileTypes: true,
        })
        .filter((entry) => entry.isDirectory())
        .map((entry) => path.resolve(params.worktreeParent, entry.name))
        .filter((checkoutPath) => checkoutPath !== params.stableCheckoutPath)
        .filter((checkoutPath) => !params.activeWorktreePaths.has(checkoutPath))
        .filter((checkoutPath) =>
            fs.existsSync(
                path.join(checkoutPath, ".agentchat", "local", "manifest.json"),
            ),
        );
}

async function main(): Promise<void> {
    const dryRun = process.argv.includes("--dry-run");
    const repoRoot = requireRepoRoot();
    const worktreeParent = path.resolve(resolveWorktreeParent(repoRoot));
    const hostConfig = loadHostConfig();
    const stableCheckoutPath = path.resolve(hostConfig.stableCheckoutPath);
    const activeWorktreePaths = new Set(
        listGitWorktrees(repoRoot).map((worktree) =>
            path.resolve(worktree.path),
        ),
    );

    const candidateCheckoutPaths = new Set<string>();
    for (const lease of loadPortLeases().leases) {
        candidateCheckoutPaths.add(path.resolve(lease.checkoutPath));
    }
    for (const service of loadProcessRegistry().services) {
        candidateCheckoutPaths.add(path.resolve(service.checkoutPath));
    }
    for (const checkoutPath of collectManagedSiblingManifestPaths({
        worktreeParent,
        stableCheckoutPath,
        activeWorktreePaths,
    })) {
        candidateCheckoutPaths.add(checkoutPath);
    }

    const staleCheckoutPaths = [...candidateCheckoutPaths]
        .filter((checkoutPath) =>
            isStaleManagedCheckoutPath({
                checkoutPath,
                stableCheckoutPath,
                activeWorktreePaths,
                worktreeParent,
            }),
        )
        .sort((left, right) => left.localeCompare(right));

    if (staleCheckoutPaths.length === 0) {
        console.log(
            dryRun
                ? "No stale wrapper-managed worktree state found."
                : "No stale wrapper-managed worktree state needed cleanup.",
        );
        return;
    }

    for (const checkoutPath of staleCheckoutPaths) {
        const laneRoots = laneStateRootsForCheckout(checkoutPath);
        if (dryRun) {
            console.log(`Would clean checkout: ${checkoutPath}`);
            for (const laneRoot of laneRoots) {
                console.log(`- lane state: ${laneRoot}`);
            }
            continue;
        }

        await stopManagedServicesForCheckoutPath(checkoutPath);
        updatePortLeases((leases) =>
            removeLeasesForCheckout(leases, checkoutPath),
        );
        updateProcessRegistry((registry) =>
            removeManagedServicesForCheckout(registry, checkoutPath),
        );
        for (const laneRoot of laneRoots) {
            fs.rmSync(laneRoot, { recursive: true, force: true });
        }

        console.log(`Cleaned checkout: ${checkoutPath}`);
        for (const laneRoot of laneRoots) {
            console.log(`- lane state: ${laneRoot}`);
        }
    }
}

main().catch((error) => {
    console.error(
        error instanceof Error
            ? error.message
            : "Worktree garbage collection failed.",
    );
    process.exitCode = 1;
});
