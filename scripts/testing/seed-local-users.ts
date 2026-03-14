import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

type SeedUser = {
    username: string;
    displayName: string;
    password: string;
};

const DEFAULT_USERS: SeedUser[] = [
    {
        username: "smoke_1",
        displayName: "Smoke 1",
        password: "smoke_1_password",
    },
    {
        username: "smoke_2",
        displayName: "Smoke 2",
        password: "smoke_2_password",
    },
];

function getRepoRoot(): string {
    const scriptDir = path.dirname(fileURLToPath(import.meta.url));
    return path.resolve(scriptDir, "..", "..");
}

function getConvexCwd(repoRoot: string): string {
    return path.join(repoRoot, "packages", "convex");
}

function runConvexSignIn(
    repoRoot: string,
    args: Record<string, unknown>,
): { ok: true; stdout: string } | { ok: false; stderr: string } {
    const result = spawnSync(
        "bunx",
        ["convex", "run", "auth:signIn", JSON.stringify(args)],
        {
            cwd: getConvexCwd(repoRoot),
            encoding: "utf8",
        },
    );

    if (result.status === 0) {
        return { ok: true, stdout: result.stdout ?? "" };
    }

    return {
        ok: false,
        stderr: `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim(),
    };
}

function isInvalidCredentialsError(stderr: string): boolean {
    return /Invalid credentials|InvalidAccountId/i.test(stderr);
}

function parseUsersFromArgs(argv: string[]): SeedUser[] {
    const users = [...DEFAULT_USERS];

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg !== "--user") {
            throw new Error(`Unsupported argument: ${arg}`);
        }

        const value = argv[index + 1];
        if (!value) {
            throw new Error("--user requires username:displayName:password");
        }

        const [username, displayName, password] = value.split(":");
        if (!username || !displayName || !password) {
            throw new Error("--user requires username:displayName:password");
        }
        users.push({ username, displayName, password });
        index += 1;
    }

    return users;
}

async function main() {
    const repoRoot = getRepoRoot();
    const users = parseUsersFromArgs(process.argv.slice(2));

    for (const user of users) {
        const signInResult = runConvexSignIn(repoRoot, {
            provider: "password",
            params: {
                flow: "signIn",
                username: user.username,
                password: user.password,
            },
            calledBy: "seed-local-users",
        });

        if (signInResult.ok) {
            console.log(
                `[agentchat] local user ${user.username} already exists`,
            );
            continue;
        }

        if (!isInvalidCredentialsError(signInResult.stderr)) {
            throw new Error(
                `Failed to check local user ${user.username}: ${signInResult.stderr}`,
            );
        }

        const signUpResult = runConvexSignIn(repoRoot, {
            provider: "password",
            params: {
                flow: "signUp",
                username: user.username,
                displayName: user.displayName,
                password: user.password,
            },
            calledBy: "seed-local-users",
        });

        if (!signUpResult.ok) {
            throw new Error(
                `Failed to create local user ${user.username}: ${signUpResult.stderr}`,
            );
        }

        console.log(`[agentchat] created local user ${user.username}`);
    }

    console.log("[agentchat] local smoke users ready");
}

await main();
