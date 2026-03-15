import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createBackendSessionToken } from "../../packages/shared/src/core/backend-token";
import {
    parseConvexRunOutput,
    trimTrailingSlash,
    tryReadEnvValue,
} from "./lib";

type Identity = {
    subject: string;
    email: string;
    name: string;
};

type Mode = "smoke" | "interrupt" | "status" | "multi-client";
type ExtendedMode = Mode | "stale-resume";

type AgentOptions = {
    agentId: string;
    allowedProviders: Array<{
        id: string;
        kind: string;
        label: string;
    }>;
    defaultProviderId: string;
    defaultModel: string | null;
    defaultVariant: string | null;
};

type BootstrapPayload = {
    auth: {
        activeProvider: {
            kind: "google" | "local";
        } | null;
    };
};

type ProviderModels = {
    providerId: string;
    models: Array<{
        id: string;
        label: string;
        supportsReasoning: boolean;
        variants: Array<{
            id: string;
            label: string;
        }>;
    }>;
};

type ServerEvent = {
    type: string;
    payload: Record<string, unknown>;
};

type LiveSmokeArgs = {
    mode: ExtendedMode;
    serverUrl: string;
    email: string;
    username: string | null;
    password: string | null;
    agentId: string | null;
    modelId: string | null;
    variantId: string | null;
};

type FailureSnapshot = {
    conversation: unknown;
    assistantMessage: unknown;
    messages: unknown;
    runs: unknown;
    runtimeBinding: unknown;
};

type LiveOutcome =
    | {
          status: "completed";
          runId: string;
          content: string;
          sawDelta: boolean;
      }
    | {
          status: "interrupted";
          runId: string;
          content: string;
          sawDelta: boolean;
      };

type MultiClientOutcome = {
    status: "completed";
    runId: string;
    content: string;
    sawDelta: boolean;
    observerSawRunStarted: boolean;
    senderClosedAfterRunStarted: boolean;
    observerSawEventsAfterSenderClosed: boolean;
};

type PersistedRunEvent = {
    sequence: number;
    kind:
        | "run_started"
        | "message_delta"
        | "message_completed"
        | "run_completed"
        | "run_interrupted"
        | "run_failed"
        | "approval_requested"
        | "approval_resolved"
        | "user_input_requested"
        | "user_input_resolved"
        | "provider_status";
    textDelta: string | null;
    errorMessage: string | null;
    messageLocalId: string | null;
    createdAt: number;
};

const DEFAULT_SERVER_URL = "http://127.0.0.1:3030";
const DEFAULT_EMAIL = "agentchat-live-smoke@local.agentchat";
const DEFAULT_LOCAL_USERNAME = "smoke_1";
const DEFAULT_LOCAL_PASSWORD = "smoke_1_password";
const INTERRUPT_FALLBACK_DELAY_MS = 5000;
const INTERRUPT_RETRY_INTERVAL_MS = 250;
const MULTI_CLIENT_SUBSCRIPTION_SETTLE_MS = 100;
const RUNTIME_TIMEOUT_MS = 120_000;
const DEBUG_LIVE_SMOKE = process.env.AGENTCHAT_DEBUG_LIVE_SMOKE === "1";

function invariant(condition: unknown, message: string): asserts condition {
    if (!condition) {
        throw new Error(message);
    }
}

function debugLiveSmoke(...parts: unknown[]): void {
    if (!DEBUG_LIVE_SMOKE) {
        return;
    }
    console.error("[live-runtime-smoke]", ...parts);
}

function getRepoRoot(): string {
    const scriptDir = path.dirname(fileURLToPath(import.meta.url));
    return path.resolve(scriptDir, "..", "..");
}

function parseArgs(argv: string[]): LiveSmokeArgs {
    let mode: ExtendedMode = "smoke";
    let serverUrl = DEFAULT_SERVER_URL;
    let email = DEFAULT_EMAIL;
    let username: string | null = null;
    let password: string | null = null;
    let agentId: string | null = null;
    let modelId: string | null = null;
    let variantId: string | null = null;

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === "--mode") {
            const value = argv[index + 1];
            if (
                value !== "smoke" &&
                value !== "interrupt" &&
                value !== "status" &&
                value !== "multi-client" &&
                value !== "stale-resume"
            ) {
                throw new Error(
                    "--mode must be smoke, interrupt, status, multi-client, or stale-resume.",
                );
            }
            mode = value;
            index += 1;
            continue;
        }

        if (arg === "--server-url") {
            const value = argv[index + 1];
            if (!value) {
                throw new Error("--server-url requires a value.");
            }
            serverUrl = value;
            index += 1;
            continue;
        }

        if (arg === "--email") {
            const value = argv[index + 1];
            if (!value) {
                throw new Error("--email requires a value.");
            }
            email = value;
            index += 1;
            continue;
        }

        if (arg === "--username") {
            const value = argv[index + 1];
            if (!value) {
                throw new Error("--username requires a value.");
            }
            username = value;
            index += 1;
            continue;
        }

        if (arg === "--password") {
            const value = argv[index + 1];
            if (!value) {
                throw new Error("--password requires a value.");
            }
            password = value;
            index += 1;
            continue;
        }

        if (arg === "--agent-id") {
            const value = argv[index + 1];
            if (!value) {
                throw new Error("--agent-id requires a value.");
            }
            agentId = value;
            index += 1;
            continue;
        }

        if (arg === "--model-id") {
            const value = argv[index + 1];
            if (!value) {
                throw new Error("--model-id requires a value.");
            }
            modelId = value;
            index += 1;
            continue;
        }

        if (arg === "--variant-id") {
            const value = argv[index + 1];
            if (!value) {
                throw new Error("--variant-id requires a value.");
            }
            variantId = value;
            index += 1;
            continue;
        }

        throw new Error(`Unsupported argument: ${arg}`);
    }

    return {
        mode,
        serverUrl: trimTrailingSlash(serverUrl),
        email,
        username,
        password,
        agentId,
        modelId,
        variantId,
    };
}

function getConvexCwd(repoRoot: string): string {
    return path.join(repoRoot, "packages", "convex");
}

function getServerEnvPath(repoRoot: string): string {
    return path.join(repoRoot, "apps", "server", ".env.local");
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

async function fetchJson<T>(url: string): Promise<T> {
    const response = await fetch(url, {
        headers: {
            "cache-control": "no-store",
        },
    });

    if (!response.ok) {
        throw new Error(
            `Request failed (${response.status}) for ${url}: ${await response.text()}`,
        );
    }

    return (await response.json()) as T;
}

async function assertServerReady(serverUrl: string): Promise<void> {
    let health: { ok: boolean; summary?: string };
    try {
        health = await fetchJson<{ ok: boolean; summary?: string }>(
            `${serverUrl}/health`,
        );
    } catch (error) {
        throw new Error(
            `Agentchat server is not reachable at ${serverUrl}. Start apps/server before running this manual smoke test.`,
            { cause: error },
        );
    }
    invariant(health.ok, "Agentchat server health check failed.");
}

function getDefaultAgentId(mode: ExtendedMode): string {
    return mode === "interrupt" ? "agentchat-workspace" : "agentchat-test";
}

function resolveReasoningEffort(variantId: string | null): string {
    switch (variantId) {
        case "low":
        case "medium":
        case "high":
        case "xhigh":
        case "minimal":
        case "none":
            return variantId;
        case "fast":
            return "low";
        case "balanced":
            return "medium";
        case "deep":
            return "high";
        default:
            return "medium";
    }
}

function buildPrompt(mode: ExtendedMode): string {
    if (mode === "interrupt") {
        return [
            "Open notes.md.",
            "Write a one hundred item improvement plan for that file.",
            "Keep every item to one short sentence.",
        ].join(" ");
    }

    if (mode === "status") {
        return [
            "Read README.md, STATUS.md, and src/math.ts.",
            "First decide which file best explains the current test status.",
            "Then answer with two short sections:",
            "1. one brief working note",
            "2. one sentence with the answer and add(2, 3).",
        ].join(" ");
    }

    return "Read src/math.ts and reply with only the result of add(2, 3).";
}

function createIds(mode: ExtendedMode, now: number) {
    return {
        conversationId: `live-${mode}-conversation-${now}`,
        userMessageId: `live-${mode}-user-${now}`,
        assistantMessageId: `live-${mode}-assistant-${now}`,
    };
}

async function ensureTestUser(params: {
    repoRoot: string;
    email: string;
}): Promise<string> {
    const existing = runConvex<{ _id: string } | null>({
        repoRoot: params.repoRoot,
        functionName: "users:getByEmailInternal",
        args: { email: params.email },
        push: true,
    });
    if (existing?._id) {
        return existing._id;
    }

    return runConvex<string>({
        repoRoot: params.repoRoot,
        functionName: "users:create",
        args: { email: params.email },
    });
}

function runConvexRaw(params: {
    repoRoot: string;
    functionName: string;
    args: Record<string, unknown>;
}): { status: number; stdout: string; stderr: string } {
    const result = spawnSync(
        "bunx",
        ["convex", "run", params.functionName, JSON.stringify(params.args)],
        {
            cwd: getConvexCwd(params.repoRoot),
            encoding: "utf8",
        },
    );

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
}> {
    const existingSignIn = runConvexRaw({
        repoRoot: params.repoRoot,
        functionName: "auth:signIn",
        args: {
            provider: "password",
            params: {
                flow: "signIn",
                username: params.username,
                password: params.password,
            },
            calledBy: "live-runtime-smoke",
        },
    });

    if (
        existingSignIn.status !== 0 &&
        !/Invalid credentials|InvalidAccountId/i.test(existingSignIn.stderr)
    ) {
        throw new Error(
            `Failed to verify local user ${params.username}: ${existingSignIn.stderr}`,
        );
    }

    if (existingSignIn.status !== 0) {
        const signUp = runConvexRaw({
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
                calledBy: "live-runtime-smoke",
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

    return {
        userId: user._id,
        email: user.email ?? `${params.username}@local.agentchat`,
    };
}

async function resolveAccessUser(params: {
    repoRoot: string;
    email: string;
    username: string | null;
    password: string | null;
    authProviderKind: "google" | "local";
}): Promise<{
    userId: string;
    identity: Identity;
}> {
    if (params.authProviderKind === "local") {
        const username = params.username ?? DEFAULT_LOCAL_USERNAME;
        const password = params.password ?? DEFAULT_LOCAL_PASSWORD;
        const localUser = await ensureLocalTestUser({
            repoRoot: params.repoRoot,
            username,
            password,
        });
        return {
            userId: localUser.userId,
            identity: {
                subject: localUser.userId,
                email: localUser.email,
                name: username,
            },
        };
    }

    const userId = await ensureTestUser({
        repoRoot: params.repoRoot,
        email: params.email,
    });
    return {
        userId,
        identity: {
            subject: userId,
            email: params.email,
            name: "Agentchat Live Smoke",
        },
    };
}

async function issueBackendToken(params: {
    repoRoot: string;
    identity: Identity;
}): Promise<{ token: string; source: "convex" | "local" }> {
    try {
        const issued = runConvex<{ token: string }>({
            repoRoot: params.repoRoot,
            functionName: "backendTokens:issue",
            args: {},
            identity: params.identity,
        });
        return {
            token: issued.token,
            source: "convex",
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!message.includes("BACKEND_TOKEN_SECRET is not configured")) {
            throw error;
        }

        const repoRoot = params.repoRoot;
        const secret =
            process.env.BACKEND_TOKEN_SECRET?.trim() ||
            tryReadEnvValue(getServerEnvPath(repoRoot), "BACKEND_TOKEN_SECRET");
        if (!secret) {
            throw new Error(
                [
                    "Convex backend token issuance failed because BACKEND_TOKEN_SECRET is not configured on the deployment.",
                    "A local fallback token also could not be created because BACKEND_TOKEN_SECRET is not available in the current shell or apps/server/.env.local.",
                    "Set the same BACKEND_TOKEN_SECRET in Convex and apps/server before retrying.",
                ].join(" "),
            );
        }

        const nowSeconds = Math.floor(Date.now() / 1000);
        const token = await createBackendSessionToken({
            claims: {
                sub: params.identity.subject,
                userId: params.identity.subject,
                email: params.identity.email,
                iat: nowSeconds,
                exp: nowSeconds + 60 * 5,
            },
            secret,
        });
        return {
            token,
            source: "local",
        };
    }
}

async function runLiveConversation(params: {
    serverUrl: string;
    token: string;
    conversationId: string;
    agentId: string;
    modelId: string;
    variantId: string | null;
    content: string;
    userMessageId: string;
    assistantMessageId: string;
    mode: Mode;
}): Promise<LiveOutcome> {
    const wsUrl = `${params.serverUrl.replace(/^http/u, "ws")}/ws?token=${encodeURIComponent(params.token)}`;
    const socket = new WebSocket(wsUrl);

    let sawReady = false;
    let latestContent = "";
    let sawDelta = false;
    let runId: string | null = null;
    let interrupted = false;
    let interruptionSent = false;
    let interruptTimer: ReturnType<typeof setTimeout> | null = null;
    let interruptInterval: ReturnType<typeof setInterval> | null = null;

    const cleanup = () => {
        if (interruptTimer) {
            clearTimeout(interruptTimer);
            interruptTimer = null;
        }
        if (interruptInterval) {
            clearInterval(interruptInterval);
            interruptInterval = null;
        }
        if (
            socket.readyState === WebSocket.OPEN ||
            socket.readyState === WebSocket.CONNECTING
        ) {
            socket.close();
        }
    };

    return await new Promise<LiveOutcome>((resolve, reject) => {
        const timeout = setTimeout(() => {
            cleanup();
            reject(
                new Error(
                    `Timed out waiting for ${params.mode} runtime outcome.`,
                ),
            );
        }, RUNTIME_TIMEOUT_MS);

        const finish = (outcome: LiveOutcome) => {
            clearTimeout(timeout);
            cleanup();
            resolve(outcome);
        };

        const fail = (error: Error) => {
            clearTimeout(timeout);
            cleanup();
            reject(error);
        };

        const maybeSendInterrupt = () => {
            if (params.mode !== "interrupt" || interruptionSent || !sawReady) {
                return;
            }

            interruptionSent = true;
            const sendInterrupt = () => {
                socket.send(
                    JSON.stringify({
                        id: crypto.randomUUID(),
                        type: "conversation.interrupt",
                        payload: {
                            conversationId: params.conversationId,
                        },
                    }),
                );
            };

            sendInterrupt();
            interruptInterval = setInterval(() => {
                if (
                    socket.readyState !== WebSocket.OPEN ||
                    interrupted ||
                    runId === null
                ) {
                    if (interruptInterval) {
                        clearInterval(interruptInterval);
                        interruptInterval = null;
                    }
                    return;
                }
                sendInterrupt();
            }, INTERRUPT_RETRY_INTERVAL_MS);
        };

        socket.addEventListener("open", () => {
            interruptTimer = setTimeout(() => {
                maybeSendInterrupt();
            }, INTERRUPT_FALLBACK_DELAY_MS);
        });

        socket.addEventListener("error", () => {
            fail(new Error("WebSocket connection failed."));
        });

        socket.addEventListener("close", (event) => {
            if (event.code === 1000) {
                return;
            }
            fail(
                new Error(
                    `WebSocket closed unexpectedly (${event.code}) ${event.reason}`,
                ),
            );
        });

        socket.addEventListener("message", (event) => {
            const payload =
                typeof event.data === "string"
                    ? event.data
                    : Buffer.from(event.data as ArrayBuffer).toString("utf8");
            const serverEvent = JSON.parse(payload) as ServerEvent;

            if (serverEvent.type === "connection.error") {
                fail(
                    new Error(
                        String(serverEvent.payload.message ?? "Unknown error"),
                    ),
                );
                return;
            }

            if (serverEvent.type === "connection.ready") {
                sawReady = true;
                socket.send(
                    JSON.stringify({
                        id: crypto.randomUUID(),
                        type: "conversation.subscribe",
                        payload: {
                            conversationId: params.conversationId,
                        },
                    }),
                );
                socket.send(
                    JSON.stringify({
                        id: crypto.randomUUID(),
                        type: "conversation.send",
                        payload: {
                            conversationId: params.conversationId,
                            agentId: params.agentId,
                            modelId: params.modelId,
                            variantId: params.variantId,
                            content: params.content,
                            userMessageId: params.userMessageId,
                            assistantMessageId: params.assistantMessageId,
                            history: [],
                        },
                    }),
                );
                return;
            }

            if (serverEvent.type === "run.started") {
                const incomingRunId = serverEvent.payload.runId;
                invariant(
                    typeof incomingRunId === "string",
                    "Run started event missing runId.",
                );
                runId = incomingRunId;
                return;
            }

            if (serverEvent.type === "message.delta") {
                const content = serverEvent.payload.content;
                invariant(
                    typeof content === "string",
                    "Message delta event missing content.",
                );
                latestContent = content;
                sawDelta = true;
                if (params.mode === "interrupt") {
                    maybeSendInterrupt();
                }
                return;
            }

            if (serverEvent.type === "message.completed") {
                const content = serverEvent.payload.content;
                invariant(
                    typeof content === "string",
                    "Message completed event missing content.",
                );
                latestContent = content;
                return;
            }

            if (serverEvent.type === "run.completed") {
                invariant(runId, "Run completed before run started.");
                finish({
                    status: "completed",
                    runId,
                    content: latestContent,
                    sawDelta,
                });
                return;
            }

            if (serverEvent.type === "run.interrupted") {
                invariant(runId, "Run interrupted before run started.");
                interrupted = true;
                finish({
                    status: "interrupted",
                    runId,
                    content: latestContent,
                    sawDelta,
                });
                return;
            }

            if (serverEvent.type === "run.failed") {
                fail(
                    new Error(
                        String(
                            (
                                serverEvent.payload.error as
                                    | { message?: unknown }
                                    | undefined
                            )?.message ?? "Runtime failed.",
                        ),
                    ),
                );
                return;
            }
        });
    }).finally(() => {
        if (!interrupted && interruptTimer) {
            clearTimeout(interruptTimer);
        }
    });
}

async function runMultiClientConversation(params: {
    serverUrl: string;
    senderToken: string;
    observerToken: string;
    conversationId: string;
    agentId: string;
    modelId: string;
    variantId: string | null;
    content: string;
    userMessageId: string;
    assistantMessageId: string;
}): Promise<MultiClientOutcome> {
    debugLiveSmoke("multi-client:start", {
        conversationId: params.conversationId,
        agentId: params.agentId,
        modelId: params.modelId,
        variantId: params.variantId,
    });
    const senderWsUrl = `${params.serverUrl.replace(/^http/u, "ws")}/ws?token=${encodeURIComponent(params.senderToken)}`;
    const observerWsUrl = `${params.serverUrl.replace(/^http/u, "ws")}/ws?token=${encodeURIComponent(params.observerToken)}`;
    const senderSocket = new WebSocket(senderWsUrl);
    const observerSocket = new WebSocket(observerWsUrl);

    let senderReady = false;
    let observerReady = false;
    let sendStarted = false;
    let senderClosedIntentionally = false;
    let senderClosedAfterRunStarted = false;
    let observerSawRunStarted = false;
    let observerSawEventsAfterSenderClosed = false;
    let latestContent = "";
    let sawDelta = false;
    let runId: string | null = null;
    let startTimer: ReturnType<typeof setTimeout> | null = null;

    const closeSocket = (socket: WebSocket) => {
        if (
            socket.readyState === WebSocket.OPEN ||
            socket.readyState === WebSocket.CONNECTING
        ) {
            socket.close();
        }
    };

    const cleanup = () => {
        if (startTimer) {
            clearTimeout(startTimer);
            startTimer = null;
        }
        closeSocket(senderSocket);
        closeSocket(observerSocket);
    };

    const maybeStart = () => {
        if (sendStarted || !senderReady || !observerReady) {
            return;
        }
        sendStarted = true;
        debugLiveSmoke("multi-client:both-clients-ready");
        observerSocket.send(
            JSON.stringify({
                id: crypto.randomUUID(),
                type: "conversation.subscribe",
                payload: {
                    conversationId: params.conversationId,
                },
            }),
        );
        senderSocket.send(
            JSON.stringify({
                id: crypto.randomUUID(),
                type: "conversation.subscribe",
                payload: {
                    conversationId: params.conversationId,
                },
            }),
        );
        startTimer = setTimeout(() => {
            debugLiveSmoke("multi-client:sender-send");
            senderSocket.send(
                JSON.stringify({
                    id: crypto.randomUUID(),
                    type: "conversation.send",
                    payload: {
                        conversationId: params.conversationId,
                        agentId: params.agentId,
                        modelId: params.modelId,
                        variantId: params.variantId,
                        content: params.content,
                        userMessageId: params.userMessageId,
                        assistantMessageId: params.assistantMessageId,
                        history: [],
                    },
                }),
            );
        }, MULTI_CLIENT_SUBSCRIPTION_SETTLE_MS);
    };

    return await new Promise<MultiClientOutcome>((resolve, reject) => {
        const timeout = setTimeout(() => {
            cleanup();
            reject(
                new Error(
                    "Timed out waiting for multi-client runtime outcome.",
                ),
            );
        }, RUNTIME_TIMEOUT_MS);

        const finish = (outcome: MultiClientOutcome) => {
            clearTimeout(timeout);
            cleanup();
            resolve(outcome);
        };

        const fail = (error: Error) => {
            clearTimeout(timeout);
            cleanup();
            reject(error);
        };

        const parsePayload = (event: MessageEvent): ServerEvent => {
            const payload =
                typeof event.data === "string"
                    ? event.data
                    : Buffer.from(event.data as ArrayBuffer).toString("utf8");
            return JSON.parse(payload) as ServerEvent;
        };

        senderSocket.addEventListener("error", () => {
            fail(new Error("Sender WebSocket connection failed."));
        });
        observerSocket.addEventListener("error", () => {
            fail(new Error("Observer WebSocket connection failed."));
        });

        senderSocket.addEventListener("close", (event) => {
            if (senderClosedIntentionally) {
                return;
            }
            fail(
                new Error(
                    `Sender WebSocket closed unexpectedly (${event.code}) ${event.reason}`,
                ),
            );
        });
        observerSocket.addEventListener("close", (event) => {
            if (event.code === 1000) {
                return;
            }
            fail(
                new Error(
                    `Observer WebSocket closed unexpectedly (${event.code}) ${event.reason}`,
                ),
            );
        });

        senderSocket.addEventListener("message", (event) => {
            const serverEvent = parsePayload(event);

            if (serverEvent.type === "connection.error") {
                fail(
                    new Error(
                        String(serverEvent.payload.message ?? "Unknown error"),
                    ),
                );
                return;
            }

            if (serverEvent.type === "connection.ready") {
                senderReady = true;
                debugLiveSmoke("multi-client:sender-ready");
                maybeStart();
                return;
            }

            if (serverEvent.type === "run.started") {
                const incomingRunId = serverEvent.payload.runId;
                invariant(
                    typeof incomingRunId === "string",
                    "Sender run started event missing runId.",
                );
                runId = incomingRunId;
                debugLiveSmoke("multi-client:sender-run-started", {
                    runId,
                });
                if (!senderClosedIntentionally) {
                    senderClosedAfterRunStarted = true;
                    senderClosedIntentionally = true;
                    debugLiveSmoke("multi-client:sender-close");
                    closeSocket(senderSocket);
                }
                return;
            }

            if (serverEvent.type === "run.failed") {
                fail(
                    new Error(
                        String(
                            (
                                serverEvent.payload.error as
                                    | { message?: unknown }
                                    | undefined
                            )?.message ?? "Runtime failed.",
                        ),
                    ),
                );
            }
        });

        observerSocket.addEventListener("message", (event) => {
            const serverEvent = parsePayload(event);

            if (serverEvent.type === "connection.error") {
                fail(
                    new Error(
                        String(serverEvent.payload.message ?? "Unknown error"),
                    ),
                );
                return;
            }

            if (serverEvent.type === "connection.ready") {
                observerReady = true;
                debugLiveSmoke("multi-client:observer-ready");
                maybeStart();
                return;
            }

            if (serverEvent.type === "run.started") {
                const incomingRunId = serverEvent.payload.runId;
                invariant(
                    typeof incomingRunId === "string",
                    "Observer run started event missing runId.",
                );
                runId = incomingRunId;
                observerSawRunStarted = true;
                debugLiveSmoke("multi-client:observer-run-started", {
                    runId,
                });
                if (senderClosedIntentionally) {
                    observerSawEventsAfterSenderClosed = true;
                }
                return;
            }

            if (serverEvent.type === "message.delta") {
                const content = serverEvent.payload.content;
                invariant(
                    typeof content === "string",
                    "Observer message delta event missing content.",
                );
                latestContent = content;
                sawDelta = true;
                debugLiveSmoke("multi-client:observer-delta", {
                    length: content.length,
                });
                if (senderClosedIntentionally) {
                    observerSawEventsAfterSenderClosed = true;
                }
                return;
            }

            if (serverEvent.type === "message.completed") {
                const content = serverEvent.payload.content;
                invariant(
                    typeof content === "string",
                    "Observer message completed event missing content.",
                );
                latestContent = content;
                debugLiveSmoke("multi-client:observer-message-completed", {
                    length: content.length,
                });
                if (senderClosedIntentionally) {
                    observerSawEventsAfterSenderClosed = true;
                }
                return;
            }

            if (serverEvent.type === "run.completed") {
                invariant(runId, "Run completed before run started.");
                debugLiveSmoke("multi-client:observer-run-completed", {
                    runId,
                    sawDelta,
                });
                finish({
                    status: "completed",
                    runId,
                    content: latestContent,
                    sawDelta,
                    observerSawRunStarted,
                    senderClosedAfterRunStarted,
                    observerSawEventsAfterSenderClosed,
                });
                return;
            }

            if (serverEvent.type === "run.failed") {
                fail(
                    new Error(
                        String(
                            (
                                serverEvent.payload.error as
                                    | { message?: unknown }
                                    | undefined
                            )?.message ?? "Runtime failed.",
                        ),
                    ),
                );
            }
        });
    });
}

function getConvexSiteUrl(repoRoot: string): string {
    const value =
        process.env.AGENTCHAT_CONVEX_SITE_URL?.trim() ||
        tryReadEnvValue(
            getServerEnvPath(repoRoot),
            "AGENTCHAT_CONVEX_SITE_URL",
        );
    if (!value) {
        throw new Error("AGENTCHAT_CONVEX_SITE_URL is not configured.");
    }
    return trimTrailingSlash(value);
}

function getRuntimeIngressSecret(repoRoot: string): string {
    const value =
        process.env.RUNTIME_INGRESS_SECRET?.trim() ||
        tryReadEnvValue(getServerEnvPath(repoRoot), "RUNTIME_INGRESS_SECRET");
    if (!value) {
        throw new Error("RUNTIME_INGRESS_SECRET is not configured.");
    }
    return value;
}

async function postRuntimeIngress<T>(params: {
    repoRoot: string;
    path: string;
    payload: Record<string, unknown>;
}): Promise<T> {
    const response = await fetch(
        `${getConvexSiteUrl(params.repoRoot)}${params.path}`,
        {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "x-agentchat-runtime-secret": getRuntimeIngressSecret(
                    params.repoRoot,
                ),
            },
            body: JSON.stringify(params.payload),
        },
    );

    if (!response.ok) {
        throw new Error(
            `Runtime ingress request failed (${response.status}) for ${params.path}: ${await response.text()}`,
        );
    }

    return (await response.json()) as T;
}

async function tryCollectFailureSnapshot(params: {
    repoRoot: string;
    userId: string;
    identity: Identity | null;
    conversationLocalId: string;
    assistantMessageLocalId: string;
}): Promise<FailureSnapshot | null> {
    try {
        const conversation = runConvex({
            repoRoot: params.repoRoot,
            functionName: "chats:getByLocalId",
            args: {
                userId: params.userId,
                localId: params.conversationLocalId,
            },
            identity: params.identity ?? undefined,
        });

        const assistantMessage = runConvex({
            repoRoot: params.repoRoot,
            functionName: "messages:getByLocalId",
            args: {
                userId: params.userId,
                localId: params.assistantMessageLocalId,
            },
            identity: params.identity ?? undefined,
        });

        const messages =
            conversation &&
            typeof conversation === "object" &&
            "_id" in conversation
                ? runConvex({
                      repoRoot: params.repoRoot,
                      functionName: "messages:listByChat",
                      args: {
                          chatId: (conversation as { _id: string })._id,
                      },
                      identity: params.identity ?? undefined,
                  })
                : null;

        const runs =
            conversation &&
            typeof conversation === "object" &&
            "_id" in conversation
                ? runConvex({
                      repoRoot: params.repoRoot,
                      functionName: "runs:listByChat",
                      args: {
                          chatId: (conversation as { _id: string })._id,
                      },
                      identity: params.identity ?? undefined,
                  })
                : null;

        const runtimeBinding = await postRuntimeIngress({
            repoRoot: params.repoRoot,
            path: "/runtime/runtime-binding/read",
            payload: {
                userId: params.userId,
                conversationLocalId: params.conversationLocalId,
            },
        });

        return {
            conversation,
            assistantMessage,
            messages,
            runs,
            runtimeBinding: null,
        };
    } catch {
        return null;
    }
}

function assertSmokeContent(content: string): void {
    const normalized = content.trim();
    invariant(
        /(^|[^0-9])5[.]?$/u.test(normalized),
        `Unexpected smoke response: ${JSON.stringify(content)}`,
    );
}

function assertStatusContent(content: string): void {
    const normalized = content.trim();
    invariant(
        normalized.includes("STATUS.md"),
        `Expected status response to reference STATUS.md, got ${JSON.stringify(content)}`,
    );
    invariant(
        /add\(2,\s*3\).*5|5.*add\(2,\s*3\)/isu.test(normalized),
        `Expected status response to mention add(2, 3) = 5, got ${JSON.stringify(content)}`,
    );
}

function assertTerminalBinding(params: {
    binding: {
        provider: string;
        status: string;
        providerThreadId: string | null;
        activeRunId: string | null;
        lastError: string | null;
        lastEventAt: number | null;
        expiresAt: number | null;
    } | null;
    expectedProvider: string;
    expectedThreadId?: string | null;
    expectedStatus: "idle" | "errored" | "expired" | "active";
}): void {
    invariant(params.binding, "Expected a persisted runtime binding.");
    invariant(
        params.binding.provider === params.expectedProvider,
        `Expected runtime binding provider ${params.expectedProvider}, got ${params.binding.provider}.`,
    );
    invariant(
        params.binding.status === params.expectedStatus,
        `Expected runtime binding status ${params.expectedStatus}, got ${params.binding.status}.`,
    );
    invariant(
        params.binding.activeRunId === null,
        "Expected runtime binding activeRunId to be cleared after terminal persistence.",
    );
    invariant(
        params.binding.lastError === null,
        `Expected no runtime binding error, got ${params.binding.lastError}.`,
    );
    invariant(
        typeof params.binding.lastEventAt === "number",
        "Expected runtime binding lastEventAt to be persisted.",
    );
    invariant(
        params.binding.expiresAt === null,
        "Expected runtime binding expiresAt to remain null until idle eviction.",
    );
    invariant(
        typeof params.binding.providerThreadId === "string" &&
            params.binding.providerThreadId.length > 0,
        "Expected runtime binding providerThreadId to be persisted.",
    );
    if (params.expectedThreadId) {
        invariant(
            params.binding.providerThreadId === params.expectedThreadId,
            "Expected runtime binding thread id to match the completed run thread.",
        );
    }
}

function assertRunEventTimeline(params: {
    events: PersistedRunEvent[];
    assistantMessageId: string;
    finalStatus: "completed" | "interrupted";
    finalContent: string;
    sawDelta: boolean;
}): void {
    invariant(params.events.length >= 3, "Expected persisted run events.");

    const sequences = params.events.map((event) => event.sequence);
    const sortedSequences = [...sequences].sort((left, right) => left - right);
    invariant(
        JSON.stringify(sequences) === JSON.stringify(sortedSequences),
        "Expected run events to be stored in ascending sequence order.",
    );

    const [firstEvent] = params.events;
    invariant(
        firstEvent.kind === "run_started",
        `Expected first run event to be run_started, got ${firstEvent.kind}.`,
    );
    invariant(
        firstEvent.messageLocalId === params.assistantMessageId,
        "Expected run_started event to point at the assistant message.",
    );

    const secondToLastEvent = params.events.at(-2);
    const lastEvent = params.events.at(-1);
    invariant(secondToLastEvent, "Expected a message_completed event.");
    invariant(lastEvent, "Expected a terminal run event.");
    invariant(
        secondToLastEvent.kind === "message_completed",
        `Expected second-to-last run event to be message_completed, got ${secondToLastEvent.kind}.`,
    );
    invariant(
        lastEvent.kind ===
            (params.finalStatus === "completed"
                ? "run_completed"
                : "run_interrupted"),
        `Expected final run event to match ${params.finalStatus}, got ${lastEvent.kind}.`,
    );

    const deltaEvents = params.events.filter(
        (event) => event.kind === "message_delta",
    );
    if (params.sawDelta) {
        if (deltaEvents.length > 0) {
            const reconstructedContent = deltaEvents
                .map((event) => event.textDelta ?? "")
                .join("");
            invariant(
                params.finalContent.startsWith(reconstructedContent),
                "Expected persisted deltas to remain a prefix of the final assistant content.",
            );
        } else {
            invariant(
                params.finalContent.length > 0,
                "Expected streamed runs without persisted deltas to still complete with assistant content.",
            );
        }
    }

    if (!params.sawDelta) {
        invariant(
            deltaEvents.length === 0 || params.finalContent.length > 0,
            "Expected empty-delta runs to avoid phantom persisted content.",
        );
    }
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const repoRoot = getRepoRoot();

    await assertServerReady(args.serverUrl);

    const bootstrap = await fetchJson<BootstrapPayload>(
        `${args.serverUrl}/api/bootstrap`,
    );
    const { userId, identity } = await resolveAccessUser({
        repoRoot,
        email: args.email,
        username: args.username,
        password: args.password,
        authProviderKind: bootstrap.auth.activeProvider?.kind ?? "google",
    });

    runConvex<void>({
        repoRoot,
        functionName: "users:resetWorkspaceData",
        args: {},
        identity: identity ?? undefined,
    });

    const agentId = args.agentId ?? getDefaultAgentId(args.mode);
    const agentOptions = await fetchJson<AgentOptions>(
        `${args.serverUrl}/api/agents/${encodeURIComponent(agentId)}/options`,
    );
    const providerId = agentOptions.defaultProviderId;
    const providerModels = await fetchJson<ProviderModels>(
        `${args.serverUrl}/api/providers/${encodeURIComponent(providerId)}/models`,
    );

    const modelId = args.modelId ?? agentOptions.defaultModel;
    invariant(modelId, `Agent ${agentId} is missing a default model.`);
    const model = providerModels.models.find((entry) => entry.id === modelId);
    invariant(
        model,
        `Model ${modelId} is not available for provider ${providerId}.`,
    );

    const variantId =
        args.variantId ??
        (args.mode === "interrupt" &&
        model.variants.some((variant) => variant.id === "high")
            ? "high"
            : args.mode === "status" &&
                model.variants.some((variant) => variant.id === "xhigh")
              ? "xhigh"
              : args.mode === "status" &&
                  model.variants.some((variant) => variant.id === "high")
                ? "high"
                : agentOptions.defaultVariant);
    if (variantId !== null) {
        invariant(
            model.variants.some((variant) => variant.id === variantId),
            `Variant ${variantId} is not available for model ${modelId}.`,
        );
    }

    const now = Date.now();
    const ids = createIds(args.mode, now);
    const reasoningEffort = resolveReasoningEffort(variantId);

    const chatId = runConvex<string>({
        repoRoot,
        functionName: "chats:create",
        args: {
            userId,
            localId: ids.conversationId,
            agentId,
            title:
                args.mode === "interrupt"
                    ? "Live interrupt smoke"
                    : "Live runtime smoke",
            modelId,
            variantId,
            createdAt: now,
            updatedAt: now,
        },
        identity: identity ?? undefined,
    });

    runConvex<string>({
        repoRoot,
        functionName: "messages:create",
        args: {
            userId,
            chatId,
            localId: ids.userMessageId,
            role: "user",
            content: buildPrompt(args.mode),
            contextContent: buildPrompt(args.mode),
            modelId,
            variantId,
            reasoningEffort,
            createdAt: now + 1,
        },
        identity: identity ?? undefined,
    });

    if (args.mode === "stale-resume") {
        await postRuntimeIngress<{ ok: true }>({
            repoRoot,
            path: "/runtime/runtime-binding",
            payload: {
                userId,
                conversationLocalId: ids.conversationId,
                provider: providerId,
                status: "expired",
                providerThreadId: "00000000-0000-4000-8000-000000000bad",
                providerResumeToken: null,
                activeRunId: null,
                lastError: null,
                lastEventAt: now + 3,
                expiresAt: now + 3,
                updatedAt: now + 3,
            },
        });
    }

    runConvex<string>({
        repoRoot,
        functionName: "messages:create",
        args: {
            userId,
            chatId,
            localId: ids.assistantMessageId,
            role: "assistant",
            content: "",
            contextContent: "",
            modelId,
            variantId,
            reasoningEffort,
            createdAt: now + 2,
        },
        identity,
    });

    const token = await issueBackendToken({
        repoRoot,
        identity,
    });

    let outcome: LiveOutcome | MultiClientOutcome;
    try {
        if (args.mode === "multi-client") {
            const observerToken = await issueBackendToken({
                repoRoot,
                identity,
            });
            debugLiveSmoke("main:issued-multi-client-tokens");
            outcome = await runMultiClientConversation({
                serverUrl: args.serverUrl,
                senderToken: token.token,
                observerToken: observerToken.token,
                conversationId: ids.conversationId,
                agentId,
                modelId,
                variantId,
                content: buildPrompt(args.mode),
                userMessageId: ids.userMessageId,
                assistantMessageId: ids.assistantMessageId,
            });
        } else {
            outcome = await runLiveConversation({
                serverUrl: args.serverUrl,
                token: token.token,
                conversationId: ids.conversationId,
                agentId,
                modelId,
                variantId,
                content: buildPrompt(args.mode),
                userMessageId: ids.userMessageId,
                assistantMessageId: ids.assistantMessageId,
                mode:
                    args.mode === "interrupt"
                        ? "interrupt"
                        : args.mode === "status"
                          ? "status"
                          : "smoke",
            });
        }
        debugLiveSmoke("main:outcome", outcome);
    } catch (error) {
        const snapshot = await tryCollectFailureSnapshot({
            repoRoot,
            userId,
            identity,
            conversationLocalId: ids.conversationId,
            assistantMessageLocalId: ids.assistantMessageId,
        });
        if (snapshot) {
            console.error(
                JSON.stringify(
                    {
                        failureSnapshot: snapshot,
                    },
                    null,
                    2,
                ),
            );
        }
        throw error;
    }

    const assistantMessage = runConvex<{
        status: string;
        content: string;
        runId: string | null;
        kind?: string | null;
    } | null>({
        repoRoot,
        functionName: "messages:getByLocalId",
        args: {
            userId,
            localId: ids.assistantMessageId,
        },
        identity,
    });
    invariant(assistantMessage, "Assistant message was not persisted.");
    const persistedMessages = runConvex<
        Array<{
            localId?: string | null;
            kind?: string | null;
            content: string;
            runId?: string | null;
            runMessageIndex?: number | null;
            status?: string | null;
        }>
    >({
        repoRoot,
        functionName: "messages:listByChat",
        args: { chatId },
        identity,
    });

    const runs = runConvex<
        Array<{
            externalId: string;
            status: string;
            outputMessageLocalId: string | null;
            latestEventKind: string | null;
        }>
    >({
        repoRoot,
        functionName: "runs:listByChat",
        args: { chatId },
        identity,
    });
    const run = runs.find((entry) => entry.externalId === outcome.runId);
    invariant(run, `Run ${outcome.runId} was not persisted.`);
    invariant(
        run.outputMessageLocalId === ids.assistantMessageId,
        "Persisted run output message did not match the seeded assistant message.",
    );

    const runEvents = runConvex<PersistedRunEvent[]>({
        repoRoot,
        functionName: "runs:listEventsByExternalId",
        args: {
            externalId: outcome.runId,
        },
        identity: identity ?? undefined,
    });

    const binding = await postRuntimeIngress<{
        provider: string;
        status: string;
        providerThreadId: string | null;
        activeRunId: string | null;
        lastError: string | null;
        lastEventAt: number | null;
        expiresAt: number | null;
    } | null>({
        repoRoot,
        path: "/runtime/runtime-binding/read",
        payload: {
            userId,
            conversationLocalId: ids.conversationId,
        },
    });
    debugLiveSmoke("main:persistence-loaded", {
        runId: outcome.runId,
        assistantStatus: assistantMessage.status,
        runStatus: run.status,
        eventCount: runEvents.length,
        bindingStatus: binding?.status ?? null,
    });

    if (
        args.mode === "smoke" ||
        args.mode === "status" ||
        args.mode === "multi-client" ||
        args.mode === "stale-resume"
    ) {
        invariant(
            assistantMessage.status === "completed",
            `Expected a completed assistant message, got ${assistantMessage.status}.`,
        );
        invariant(
            run.status === "completed",
            `Expected a completed run, got ${run.status}.`,
        );
        invariant(
            run.latestEventKind === "run_completed",
            `Expected latest run event kind run_completed, got ${run.latestEventKind}.`,
        );
        if (args.mode === "status") {
            assertStatusContent(assistantMessage.content);
        } else {
            assertSmokeContent(assistantMessage.content);
        }
        assertRunEventTimeline({
            events: runEvents,
            assistantMessageId: ids.assistantMessageId,
            finalStatus: "completed",
            finalContent: assistantMessage.content,
            sawDelta: outcome.sawDelta,
        });
        assertTerminalBinding({
            binding,
            expectedProvider: providerId,
            expectedStatus: "idle",
        });

        if (args.mode === "multi-client") {
            invariant(
                outcome.status === "completed",
                `Expected a completed multi-client outcome, got ${outcome.status}.`,
            );
            invariant(
                outcome.observerSawRunStarted,
                "Expected observer client to receive run.started.",
            );
            invariant(
                outcome.senderClosedAfterRunStarted,
                "Expected sender client to disconnect after run.started.",
            );
            invariant(
                outcome.observerSawEventsAfterSenderClosed,
                "Expected observer client to continue receiving live events after the sender disconnected.",
            );
        }

        if (args.mode === "status") {
            const statusMessages = persistedMessages.filter(
                (message) =>
                    message.runId === outcome.runId &&
                    message.kind === "assistant_status",
            );
            const outputMessages = persistedMessages.filter(
                (message) =>
                    message.runId === outcome.runId &&
                    message.kind === "assistant_message",
            );
            invariant(
                statusMessages.length >= 1,
                "Expected at least one persisted assistant_status message for status mode.",
            );
            invariant(
                outputMessages.length >= 1,
                "Expected at least one persisted assistant_message for status mode.",
            );
            invariant(
                statusMessages.some(
                    (message) => message.content.trim().length > 0,
                ),
                "Expected persisted assistant_status content for status mode.",
            );
            invariant(
                outputMessages.some(
                    (message) =>
                        message.localId === run.outputMessageLocalId &&
                        message.content.trim().length > 0,
                ),
                "Expected the run output message to match a persisted assistant_message with content.",
            );
        }

        if (args.mode === "stale-resume") {
            invariant(
                binding !== null,
                "Expected a runtime binding after stale resume recovery.",
            );
            invariant(
                binding.providerThreadId !==
                    "00000000-0000-4000-8000-000000000bad",
                "Expected stale runtime binding to be replaced with a fresh thread id.",
            );
        }
    } else {
        invariant(
            outcome.status === "interrupted",
            `Expected an interrupted outcome, got ${outcome.status}.`,
        );
        invariant(
            assistantMessage.status === "interrupted",
            `Expected an interrupted assistant message, got ${assistantMessage.status}.`,
        );
        invariant(
            run.status === "interrupted",
            `Expected an interrupted run, got ${run.status}.`,
        );
        invariant(
            run.latestEventKind === "run_interrupted",
            `Expected latest run event kind run_interrupted, got ${run.latestEventKind}.`,
        );
        assertRunEventTimeline({
            events: runEvents,
            assistantMessageId: ids.assistantMessageId,
            finalStatus: "interrupted",
            finalContent: assistantMessage.content,
            sawDelta: outcome.sawDelta,
        });
        assertTerminalBinding({
            binding,
            expectedProvider: providerId,
            expectedStatus: "idle",
        });
        if (outcome.sawDelta) {
            invariant(
                assistantMessage.content.trim().length > 0,
                "Interrupted assistant output should retain partial content when deltas were streamed.",
            );
        }
    }

    console.log(
        JSON.stringify(
            {
                ok: true,
                mode: args.mode,
                tokenSource: token.source,
                agentId,
                modelId,
                variantId,
                userId,
                conversationId: ids.conversationId,
                runId: outcome.runId,
                sawDelta: outcome.sawDelta,
                finalStatus: run.status,
                observerSawRunStarted:
                    "observerSawRunStarted" in outcome
                        ? outcome.observerSawRunStarted
                        : undefined,
                senderClosedAfterRunStarted:
                    "senderClosedAfterRunStarted" in outcome
                        ? outcome.senderClosedAfterRunStarted
                        : undefined,
                observerSawEventsAfterSenderClosed:
                    "observerSawEventsAfterSenderClosed" in outcome
                        ? outcome.observerSawEventsAfterSenderClosed
                        : undefined,
                contentPreview: assistantMessage.content.slice(0, 120),
            },
            null,
            2,
        ),
    );
}

try {
    await main();
} catch (error) {
    console.error(
        error instanceof Error ? error.message : "Live runtime smoke failed.",
    );
    process.exit(1);
}
