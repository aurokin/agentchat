#!/usr/bin/env bun
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TREE_STATE_PARENT = path.join(
    os.homedir(),
    ".local",
    "state",
    "agentchat-trees",
);

// Must stay in sync with sanitizeBranch in setup-tree.ts.
function sanitizeBranch(branch: string): string {
    const safe = branch.replace(/[^a-zA-Z0-9._-]/g, "-");
    if (safe === branch) return safe;
    const suffix = createHash("sha256")
        .update(branch)
        .digest("hex")
        .slice(0, 6);
    return `${safe}-${suffix}`;
}

function resolveBranch(): string {
    const fromArg = process.argv[2]?.trim();
    if (fromArg) return fromArg;
    const fromEnv = process.env.WT_BRANCH?.trim();
    if (fromEnv) return fromEnv;
    // Intentionally do not fall back to `git symbolic-ref --short HEAD`:
    // worktrunk's post-remove hook fires after the target worktree is gone,
    // so HEAD would resolve in the primary checkout and we would delete the
    // wrong tree's state.
    throw new Error(
        "teardown-tree: branch name is required (pass as first arg or WT_BRANCH env)",
    );
}

function main(): void {
    const branchSlug = sanitizeBranch(resolveBranch());
    const treeStateRoot = path.join(TREE_STATE_PARENT, branchSlug);
    if (fs.existsSync(treeStateRoot)) {
        fs.rmSync(treeStateRoot, { recursive: true, force: true });
        console.log(`teardown-tree: removed ${treeStateRoot}`);
    }
}

main();
