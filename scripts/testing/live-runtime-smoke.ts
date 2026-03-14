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

type Mode = "smoke" | "interrupt";

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
    mode: Mode;
    serverUrl: string;
    email: string;
    agentId: string | null;
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

const DEFAULT_SERVER_URL = "http://127.0.0.1:3030";
const DEFAULT_EMAIL = "agentchat-live-smoke@local.agentchat";
const INTERRUPT_FALLBACK_DELAY_MS = 5000;
const INTERRUPT_RETRY_INTERVAL_MS = 250;
const RUNTIME_TIMEOUT_MS = 120_000;

function invariant(condition: unknown, message: string): asserts condition {
    if (!condition) {
        throw new Error(message);
    }
}

function getRepoRoot(): string {
    const scriptDir = path.dirname(fileURLToPath(import.meta.url));
    return path.resolve(scriptDir, "..", "..");
}

function parseArgs(argv: string[]): LiveSmokeArgs {
    let mode: Mode = "smoke";
    let serverUrl = DEFAULT_SERVER_URL;
    let email = DEFAULT_EMAIL;
    let agentId: string | null = null;

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === "--mode") {
            const value = argv[index + 1];
            if (value !== "smoke" && value !== "interrupt") {
                throw new Error(
                    "--mode must be either 'smoke' or 'interrupt'.",
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

    return {
        mode,
        serverUrl: trimTrailingSlash(serverUrl),
        email,
        agentId,
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

function getDefaultAgentId(mode: Mode): string {
    return mode === "interrupt" ? "agentchat-workspace" : "agentchat-test";
}

function resolveThinking(variantId: string | null): string {
    switch (variantId) {
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

function buildPrompt(mode: Mode): string {
    if (mode === "interrupt") {
        return [
            "Open notes.md.",
            "Write a one hundred item improvement plan for that file.",
            "Keep every item to one short sentence.",
        ].join(" ");
    }

    return "Read src/math.ts and reply with only the result of add(2, 3).";
}

function createIds(mode: Mode, now: number) {
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
    thinking: string;
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
                            thinking: params.thinking,
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

function assertSmokeContent(content: string): void {
    const normalized = content.trim();
    invariant(
        /(^|[^0-9])5[.]?$/u.test(normalized),
        `Unexpected smoke response: ${JSON.stringify(content)}`,
    );
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const repoRoot = getRepoRoot();

    await assertServerReady(args.serverUrl);

    const userId = await ensureTestUser({
        repoRoot,
        email: args.email,
    });
    const identity: Identity = {
        subject: userId,
        email: args.email,
        name: "Agentchat Live Smoke",
    };

    runConvex<void>({
        repoRoot,
        functionName: "users:resetWorkspaceData",
        args: {},
        identity,
    });

    const agentId = args.agentId ?? getDefaultAgentId(args.mode);
    const agentOptions = await fetchJson<AgentOptions>(
        `${args.serverUrl}/api/agents/${encodeURIComponent(agentId)}/options`,
    );
    const providerId = agentOptions.defaultProviderId;
    const providerModels = await fetchJson<ProviderModels>(
        `${args.serverUrl}/api/providers/${encodeURIComponent(providerId)}/models`,
    );

    const modelId = agentOptions.defaultModel;
    invariant(modelId, `Agent ${agentId} is missing a default model.`);
    const model = providerModels.models.find((entry) => entry.id === modelId);
    invariant(
        model,
        `Model ${modelId} is not available for provider ${providerId}.`,
    );

    const variantId =
        args.mode === "interrupt" &&
        model.variants.some((variant) => variant.id === "deep")
            ? "deep"
            : agentOptions.defaultVariant;
    if (variantId !== null) {
        invariant(
            model.variants.some((variant) => variant.id === variantId),
            `Variant ${variantId} is not available for model ${modelId}.`,
        );
    }

    const now = Date.now();
    const ids = createIds(args.mode, now);
    const thinking = resolveThinking(variantId);

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
            thinking,
            createdAt: now,
            updatedAt: now,
        },
        identity,
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
            thinkingLevel: thinking,
            createdAt: now + 1,
        },
        identity,
    });

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
            thinkingLevel: thinking,
            createdAt: now + 2,
        },
        identity,
    });

    const token = await issueBackendToken({
        repoRoot,
        identity,
    });

    const outcome = await runLiveConversation({
        serverUrl: args.serverUrl,
        token: token.token,
        conversationId: ids.conversationId,
        agentId,
        modelId,
        variantId,
        thinking,
        content: buildPrompt(args.mode),
        userMessageId: ids.userMessageId,
        assistantMessageId: ids.assistantMessageId,
        mode: args.mode,
    });

    const assistantMessage = runConvex<{
        status: string;
        content: string;
        runId: string | null;
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

    const runs = runConvex<
        Array<{
            externalId: string;
            status: string;
            outputMessageLocalId: string | null;
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

    if (args.mode === "smoke") {
        invariant(
            assistantMessage.status === "completed",
            `Expected a completed assistant message, got ${assistantMessage.status}.`,
        );
        invariant(
            run.status === "completed",
            `Expected a completed run, got ${run.status}.`,
        );
        assertSmokeContent(assistantMessage.content);
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
