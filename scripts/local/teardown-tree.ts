#!/usr/bin/env bun
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TREE_STATE_PARENT = path.join(
    os.homedir(),
    ".local",
    "state",
    "agentchat-trees",
);

function sanitizeBranch(branch: string): string {
    return branch.replace(/[^a-zA-Z0-9._-]/g, "-");
}

function resolveBranch(): string {
    const fromEnv = process.env.WT_BRANCH?.trim();
    if (fromEnv) return fromEnv;
    return execFileSync("git", ["symbolic-ref", "--short", "HEAD"], {
        encoding: "utf8",
    }).trim();
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
