import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseConvexRunOutput } from "./lib";

export type LocalAuthUser = {
    _id: string;
    email?: string | null;
    username?: string | null;
    name?: string | null;
};

export type LocalAuthUserInput = {
    username: string;
    displayName: string;
    password: string;
};

export function getRepoRoot(): string {
    const scriptDir = path.dirname(fileURLToPath(import.meta.url));
    return path.resolve(scriptDir, "..", "..");
}

export function getConvexCwd(repoRoot: string): string {
    return path.join(repoRoot, "packages", "convex");
}

function runConvexCommand(repoRoot: string, args: string[]): string {
    const result = spawnSync("bunx", args, {
        cwd: getConvexCwd(repoRoot),
        encoding: "utf8",
    });

    if (result.status !== 0) {
        throw new Error(`${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim());
    }

    return result.stdout ?? "";
}

export function formatDisplayNameFromUsername(username: string): string {
    const trimmed = username.trim();
    if (!trimmed) {
        return "Local User";
    }

    const parts = trimmed
        .split(/[\s_-]+/u)
        .map((part) => part.trim())
        .filter((part) => part.length > 0);

    if (parts.length === 0) {
        return trimmed;
    }

    return parts
        .map((part) => part[0]!.toUpperCase() + part.slice(1))
        .join(" ");
}

export function findLocalUser(
    repoRoot: string,
    username: string,
): LocalAuthUser | null {
    const stdout = runConvexCommand(repoRoot, [
        "convex",
        "run",
        "users:getByUsernameInternal",
        JSON.stringify({ username }),
        "--push",
    ]);

    return (parseConvexRunOutput(stdout) as LocalAuthUser | null) ?? null;
}

export function createLocalUser(params: {
    repoRoot: string;
    user: LocalAuthUserInput;
    calledBy: string;
}): LocalAuthUser {
    const existing = findLocalUser(params.repoRoot, params.user.username);
    if (existing) {
        throw new Error(
            `Local user ${params.user.username} already exists. Choose a different username.`,
        );
    }

    runConvexCommand(params.repoRoot, [
        "convex",
        "run",
        "auth:signIn",
        JSON.stringify({
            provider: "password",
            params: {
                flow: "signUp",
                username: params.user.username,
                displayName: params.user.displayName,
                password: params.user.password,
            },
            calledBy: params.calledBy,
        }),
    ]);

    const created = findLocalUser(params.repoRoot, params.user.username);
    if (!created) {
        throw new Error(
            `Local user ${params.user.username} was created but could not be reloaded.`,
        );
    }

    return created;
}

export function ensureLocalUser(params: {
    repoRoot: string;
    user: LocalAuthUserInput;
    calledBy: string;
}): { status: "existing" | "created"; user: LocalAuthUser } {
    const existing = findLocalUser(params.repoRoot, params.user.username);
    if (existing) {
        return {
            status: "existing",
            user: existing,
        };
    }

    return {
        status: "created",
        user: createLocalUser(params),
    };
}
