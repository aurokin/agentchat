import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseConvexRunOutput } from "./lib";

type Identity = {
    subject: string;
    email: string;
    name: string;
};

type LocalUser = {
    username: string;
    password: string;
};

type TokenClaims = {
    sub?: string;
    userId?: string;
    email?: string;
};

const DEFAULT_USERS: [LocalUser, LocalUser] = [
    { username: "smoke_1", password: "smoke_1_password" },
    { username: "smoke_2", password: "smoke_2_password" },
];
const DEFAULT_AGENT_ID = "agentchat-test";
const DEFAULT_MODEL_ID = "gpt-5.4";
const DEFAULT_VARIANT_ID = "low";

function invariant(condition: unknown, message: string): asserts condition {
    if (!condition) {
        throw new Error(message);
    }
}

function getRepoRoot(): string {
    const scriptDir = path.dirname(fileURLToPath(import.meta.url));
    return path.resolve(scriptDir, "..", "..");
}

function getConvexCwd(repoRoot: string): string {
    return path.join(repoRoot, "packages", "convex");
}

function parseArgs(argv: string[]) {
    let agentId = DEFAULT_AGENT_ID;

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === "--agent-id") {
            const value = argv[index + 1];
            if (!value) {
                throw new Error("--agent-id requires a value.");
            }
            agentId = value;
            index += 1;
            continue;
        }

        throw new Error(`Unsupported argument: ${arg}`);
    }

    return { agentId };
}

function runConvex<T>(params: {
    repoRoot: string;
    functionName: string;
    args: Record<string, unknown>;
    identity?: Identity;
    push?: boolean;
}): T {
    const command = [
        "convex",
        "run",
        params.functionName,
        JSON.stringify(params.args),
    ];
    if (params.push) {
        command.push("--push");
    }
    if (params.identity) {
        command.push("--identity", JSON.stringify(params.identity));
    }

    const result = spawnSync("bunx", command, {
        cwd: getConvexCwd(params.repoRoot),
        encoding: "utf8",
    });

    if (result.status !== 0) {
        const stderr = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim();
        throw new Error(
            `Convex command failed for ${params.functionName}: ${stderr}`,
        );
    }

    return parseConvexRunOutput(result.stdout) as T;
}

function runConvexAllowFailure(params: {
    repoRoot: string;
    functionName: string;
    args: Record<string, unknown>;
    identity?: Identity;
    push?: boolean;
}): { status: number; stdout: string; stderr: string } {
    const command = [
        "convex",
        "run",
        params.functionName,
        JSON.stringify(params.args),
    ];
    if (params.push) {
        command.push("--push");
    }
    if (params.identity) {
        command.push("--identity", JSON.stringify(params.identity));
    }

    const result = spawnSync("bunx", command, {
        cwd: getConvexCwd(params.repoRoot),
        encoding: "utf8",
    });

    return {
        status: result.status ?? 1,
        stdout: result.stdout ?? "",
        stderr: `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim(),
    };
}

async function ensureLocalTestUser(params: {
    repoRoot: string;
    username: string;
    password: string;
}): Promise<{
    userId: string;
    email: string;
    identity: Identity;
}> {
    const existingSignIn = runConvexAllowFailure({
        repoRoot: params.repoRoot,
        functionName: "auth:signIn",
        args: {
            provider: "password",
            params: {
                flow: "signIn",
                username: params.username,
                password: params.password,
            },
            calledBy: "local-auth-separation",
        },
    });

    if (
        existingSignIn.status !== 0 &&
        !/Invalid credentials|InvalidAccountId/i.test(
            existingSignIn.stderr,
        )
    ) {
        throw new Error(
            `Failed to verify local user ${params.username}: ${existingSignIn.stderr}`,
        );
    }

    if (existingSignIn.status !== 0) {
        const signUp = runConvexAllowFailure({
            repoRoot: params.repoRoot,
            functionName: "auth:signIn",
            args: {
                provider: "password",
                params: {
                    flow: "signUp",
                    username: params.username,
                    displayName: params.username,
                    password: params.password,
                },
                calledBy: "local-auth-separation",
            },
        });

        if (signUp.status !== 0) {
            throw new Error(
                `Failed to create local user ${params.username}: ${signUp.stderr}`,
            );
        }
    }

    const user = runConvex<{ _id: string; email?: string | null } | null>({
        repoRoot: params.repoRoot,
        functionName: "users:getByUsernameInternal",
        args: { username: params.username },
        push: true,
    });
    invariant(user?._id, `Expected local user ${params.username} to exist.`);

    const email = user.email ?? `${params.username}@local.agentchat`;
    return {
        userId: user._id,
        email,
        identity: {
            subject: user._id,
            email,
            name: params.username,
        },
    };
}

function decodeJwtClaims(token: string): TokenClaims {
    const parts = token.split(".");
    invariant(parts.length === 3, "Expected backend token to be a JWT.");

    const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
    const payload = Buffer.from(normalized + padding, "base64").toString("utf8");
    return JSON.parse(payload) as TokenClaims;
}

function assertUnauthorized(
    result: { status: number; stderr: string },
    label: string,
) {
    if (result.status === 0) {
        throw new Error(`Expected ${label} to fail with Unauthorized.`);
    }
    if (!/Unauthorized|Not found/i.test(result.stderr)) {
        throw new Error(
            `Expected ${label} to fail with Unauthorized/Not found, got: ${result.stderr}`,
        );
    }
}

async function main() {
    const repoRoot = getRepoRoot();
    const { agentId } = parseArgs(process.argv.slice(2));
    const [userA, userB] = DEFAULT_USERS;
    const now = Date.now();
    const smoke1MessageLocalId = `smoke-1-message-${now}`;
    const smoke2MessageLocalId = `smoke-2-message-${now}`;

    const smoke1 = await ensureLocalTestUser({
        repoRoot,
        username: userA.username,
        password: userA.password,
    });
    const smoke2 = await ensureLocalTestUser({
        repoRoot,
        username: userB.username,
        password: userB.password,
    });

    invariant(
        smoke1.userId !== smoke2.userId,
        "smoke_1 and smoke_2 must resolve to different Convex users.",
    );

    runConvex({
        repoRoot,
        functionName: "users:resetWorkspaceData",
        args: {},
        identity: smoke1.identity,
    });
    runConvex({
        repoRoot,
        functionName: "users:resetWorkspaceData",
        args: {},
        identity: smoke2.identity,
    });

    const smoke1ChatId = runConvex<string>({
        repoRoot,
        functionName: "chats:create",
        args: {
            userId: smoke1.userId,
            localId: `smoke-1-chat-${now}`,
            agentId,
            title: "Smoke 1 chat",
            modelId: DEFAULT_MODEL_ID,
            variantId: DEFAULT_VARIANT_ID,
        },
        identity: smoke1.identity,
    });
    const smoke2ChatId = runConvex<string>({
        repoRoot,
        functionName: "chats:create",
        args: {
            userId: smoke2.userId,
            localId: `smoke-2-chat-${now}`,
            agentId,
            title: "Smoke 2 chat",
            modelId: DEFAULT_MODEL_ID,
            variantId: DEFAULT_VARIANT_ID,
        },
        identity: smoke2.identity,
    });

    runConvex<string>({
        repoRoot,
        functionName: "messages:create",
        args: {
            userId: smoke1.userId,
            localId: smoke1MessageLocalId,
            chatId: smoke1ChatId,
            role: "user",
            kind: "user",
            content: "hello from smoke 1",
            contextContent: "hello from smoke 1",
            modelId: DEFAULT_MODEL_ID,
            variantId: DEFAULT_VARIANT_ID,
        },
        identity: smoke1.identity,
    });
    runConvex<string>({
        repoRoot,
        functionName: "messages:create",
        args: {
            userId: smoke2.userId,
            localId: smoke2MessageLocalId,
            chatId: smoke2ChatId,
            role: "user",
            kind: "user",
            content: "hello from smoke 2",
            contextContent: "hello from smoke 2",
            modelId: DEFAULT_MODEL_ID,
            variantId: DEFAULT_VARIANT_ID,
        },
        identity: smoke2.identity,
    });

    const smoke1Chats = runConvex<Array<{ _id: string }>>({
        repoRoot,
        functionName: "chats:listByUser",
        args: { userId: smoke1.userId },
        identity: smoke1.identity,
    });
    const smoke2Chats = runConvex<Array<{ _id: string }>>({
        repoRoot,
        functionName: "chats:listByUser",
        args: { userId: smoke2.userId },
        identity: smoke2.identity,
    });

    invariant(
        smoke1Chats.length === 1 && smoke1Chats[0]?._id === smoke1ChatId,
        "smoke_1 should see only its own chat after reset.",
    );
    invariant(
        smoke2Chats.length === 1 && smoke2Chats[0]?._id === smoke2ChatId,
        "smoke_2 should see only its own chat after reset.",
    );

    const smoke2ViewOfSmoke1 = runConvex<unknown | null>({
        repoRoot,
        functionName: "chats:get",
        args: { id: smoke1ChatId },
        identity: smoke2.identity,
    });
    invariant(
        smoke2ViewOfSmoke1 === null,
        "smoke_2 must not be able to fetch smoke_1 chat by id.",
    );

    assertUnauthorized(
        runConvexAllowFailure({
            repoRoot,
            functionName: "chats:listByUser",
            args: { userId: smoke1.userId },
            identity: smoke2.identity,
        }),
        "smoke_2 listing smoke_1 chats",
    );

    const smoke2MessagesForSmoke1Chat = runConvex<Array<unknown>>({
        repoRoot,
        functionName: "messages:listByChat",
        args: { chatId: smoke1ChatId },
        identity: smoke2.identity,
    });
    invariant(
        smoke2MessagesForSmoke1Chat.length === 0,
        "smoke_2 must not receive smoke_1 messages when listing another user's chat.",
    );

    assertUnauthorized(
        runConvexAllowFailure({
            repoRoot,
            functionName: "messages:getByLocalId",
            args: {
                userId: smoke1.userId,
                localId: smoke1MessageLocalId,
            },
            identity: smoke2.identity,
        }),
        "smoke_2 loading smoke_1 message by local id",
    );

    const smoke1Token = runConvex<{ token: string }>({
        repoRoot,
        functionName: "backendTokens:issue",
        args: {},
        identity: smoke1.identity,
    });
    const smoke2Token = runConvex<{ token: string }>({
        repoRoot,
        functionName: "backendTokens:issue",
        args: {},
        identity: smoke2.identity,
    });

    const smoke1Claims = decodeJwtClaims(smoke1Token.token);
    const smoke2Claims = decodeJwtClaims(smoke2Token.token);
    invariant(
        smoke1Claims.userId === smoke1.userId &&
            smoke1Claims.sub === smoke1.userId,
        "smoke_1 backend token must resolve to smoke_1.",
    );
    invariant(
        smoke2Claims.userId === smoke2.userId &&
            smoke2Claims.sub === smoke2.userId,
        "smoke_2 backend token must resolve to smoke_2.",
    );
    invariant(
        smoke1Claims.userId !== smoke2Claims.userId,
        "Local auth backend tokens must stay user-specific.",
    );

    console.log(
        JSON.stringify(
            {
                ok: true,
                users: [
                    {
                        username: userA.username,
                        userId: smoke1.userId,
                        chatId: smoke1ChatId,
                    },
                    {
                        username: userB.username,
                        userId: smoke2.userId,
                        chatId: smoke2ChatId,
                    },
                ],
            },
            null,
            2,
        ),
    );
}

await main();
