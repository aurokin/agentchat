import fs from "node:fs";
import path from "node:path";

import { loadHostConfig } from "./hostConfig.ts";
import { sanitizeLabel } from "./util.ts";

export type GitWorktree = {
    path: string;
    branch: string | null;
    head: string | null;
};

function runGit(
    args: string[],
    cwd = process.cwd(),
): { stdout: string; stderr: string; exitCode: number } {
    const proc = Bun.spawnSync(["git", ...args], {
        cwd,
        stdout: "pipe",
        stderr: "pipe",
    });

    return {
        stdout: proc.stdout.toString(),
        stderr: proc.stderr.toString(),
        exitCode: proc.exitCode,
    };
}

export function requireRepoRoot(cwd = process.cwd()): string {
    const result = runGit(["rev-parse", "--show-toplevel"], cwd);
    if (result.exitCode !== 0) {
        throw new Error(result.stderr.trim() || "Failed to resolve repo root.");
    }
    return result.stdout.trim();
}

export function isWorkingTreeDirty(repoRoot: string): boolean {
    const result = runGit(["status", "--short"], repoRoot);
    if (result.exitCode !== 0) {
        throw new Error(
            result.stderr.trim() || "Failed to inspect git status.",
        );
    }
    return result.stdout.trim().length > 0;
}

export function listGitWorktrees(repoRoot = process.cwd()): GitWorktree[] {
    const result = runGit(["worktree", "list", "--porcelain"], repoRoot);
    if (result.exitCode !== 0) {
        throw new Error(
            result.stderr.trim() || "Failed to list git worktrees.",
        );
    }

    const entries: GitWorktree[] = [];
    let current: GitWorktree | null = null;
    for (const line of result.stdout.split(/\r?\n/)) {
        if (!line.trim()) {
            if (current) {
                entries.push(current);
                current = null;
            }
            continue;
        }

        if (line.startsWith("worktree ")) {
            if (current) {
                entries.push(current);
            }
            current = {
                path: path.resolve(line.slice("worktree ".length)),
                branch: null,
                head: null,
            };
            continue;
        }

        if (!current) {
            continue;
        }

        if (line.startsWith("branch ")) {
            current.branch = line.slice("branch ".length).trim();
        } else if (line.startsWith("HEAD ")) {
            current.head = line.slice("HEAD ".length).trim();
        }
    }

    if (current) {
        entries.push(current);
    }
    return entries;
}

export function resolveWorktreeParent(repoRoot: string): string {
    return path.dirname(path.resolve(repoRoot));
}

export function resolveWorktreeTargetPath(
    repoRoot: string,
    worktreeName: string,
): string {
    return path.join(resolveWorktreeParent(repoRoot), worktreeName);
}

export function validateWorktreeName(rawName: string): string {
    const name = rawName.trim();
    if (!name) {
        throw new Error(
            "Missing worktree name. Usage: bun run worktree:create -- <name>",
        );
    }

    if (sanitizeLabel(name) !== name || name.includes(path.sep)) {
        throw new Error(
            "Worktree names must use only letters, numbers, dots, underscores, and dashes.",
        );
    }

    return name;
}

export function ensureSafeWorktreeTarget(targetPath: string): void {
    const resolvedTarget = path.resolve(targetPath);
    const stableCheckoutPath = path.resolve(
        loadHostConfig().stableCheckoutPath,
    );
    const currentCheckoutPath = path.resolve(requireRepoRoot());

    if (resolvedTarget === stableCheckoutPath) {
        throw new Error(
            "Refusing to operate on the stable checkout with worktree commands.",
        );
    }

    if (resolvedTarget === currentCheckoutPath) {
        throw new Error(
            "Refusing to operate on the current checkout with worktree commands.",
        );
    }
}

export function findWorktreeByPath(
    repoRoot: string,
    targetPath: string,
): GitWorktree | null {
    const resolvedTarget = path.resolve(targetPath);
    return (
        listGitWorktrees(repoRoot).find(
            (entry) => path.resolve(entry.path) === resolvedTarget,
        ) ?? null
    );
}

export function branchExists(repoRoot: string, branchName: string): boolean {
    const result = runGit(
        ["show-ref", "--verify", "--quiet", `refs/heads/${branchName}`],
        repoRoot,
    );
    return result.exitCode === 0;
}

export function assertPathAvailable(targetPath: string): void {
    if (fs.existsSync(targetPath)) {
        throw new Error(
            `Refusing to create worktree at ${targetPath} because the path already exists.`,
        );
    }
}

export function spawnOrThrow(params: {
    cmd: string[];
    cwd: string;
    label: string;
    env?: Record<string, string | undefined>;
}): void {
    const proc = Bun.spawnSync(params.cmd, {
        cwd: params.cwd,
        env: params.env,
        stdout: "inherit",
        stderr: "inherit",
    });
    if (proc.exitCode !== 0) {
        throw new Error(`${params.label} failed.`);
    }
}
