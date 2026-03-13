import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import readline from "node:readline";

import type { AgentConfig, ProviderConfig } from "./config.ts";

type JsonRpcResponse = {
    id?: number | string;
    result?: unknown;
    error?: {
        message?: string;
    };
};

export type JsonRpcNotification = {
    method?: string;
    params?: Record<string, unknown>;
};

export type CodexClient = {
    initialize: () => Promise<void>;
    request: (method: string, params: unknown) => Promise<unknown>;
    onNotification: (
        handler: (notification: JsonRpcNotification) => void,
    ) => void;
    onExit: (handler: (error: Error) => void) => void;
    stop: () => void;
};

export type CreateCodexClient = (params: {
    provider: ProviderConfig;
    agent: AgentConfig;
}) => CodexClient;

function toJsonLine(value: unknown): string {
    return `${JSON.stringify(value)}\n`;
}

export class CodexAppServerClient implements CodexClient {
    private readonly child: ChildProcessWithoutNullStreams;
    private readonly pending = new Map<
        number,
        {
            resolve: (result: unknown) => void;
            reject: (error: Error) => void;
        }
    >();
    private nextId = 1;
    private notificationHandler:
        | ((notification: JsonRpcNotification) => void)
        | null = null;
    private exitHandler: ((error: Error) => void) | null = null;
    private isStopping = false;
    private hasExited = false;

    constructor(params: { provider: ProviderConfig; agent: AgentConfig }) {
        const { provider } = params;
        this.child = spawn(provider.codex.command, provider.codex.args, {
            cwd: provider.codex.cwd ?? params.agent.rootPath,
            env: {
                ...process.env,
                ...provider.codex.baseEnv,
            },
            stdio: "pipe",
        });

        const stdout = readline.createInterface({
            input: this.child.stdout,
            crlfDelay: Infinity,
        });

        stdout.on("line", (line) => {
            if (!line.trim()) return;

            let parsed: JsonRpcResponse | JsonRpcNotification;
            try {
                parsed = JSON.parse(line) as
                    | JsonRpcResponse
                    | JsonRpcNotification;
            } catch (error) {
                console.error("[agentchat-server] invalid codex JSON", error);
                return;
            }

            if ("id" in parsed && parsed.id !== undefined) {
                const response = parsed as JsonRpcResponse;
                const requestId =
                    typeof response.id === "number"
                        ? response.id
                        : Number.parseInt(String(response.id), 10);
                const pending = this.pending.get(requestId);
                if (!pending) return;
                this.pending.delete(requestId);

                if (response.error?.message) {
                    pending.reject(new Error(response.error.message));
                    return;
                }

                pending.resolve(response.result);
                return;
            }

            this.notificationHandler?.(parsed as JsonRpcNotification);
        });

        this.child.stderr.on("data", (chunk) => {
            const text = chunk.toString().trim();
            if (text) {
                console.error(`[agentchat-server][codex] ${text}`);
            }
        });

        this.child.on("error", (error) => {
            if (this.hasExited) {
                return;
            }
            this.hasExited = true;
            for (const [, pending] of this.pending) {
                pending.reject(error);
            }
            this.pending.clear();
            if (!this.isStopping) {
                this.exitHandler?.(error);
            }
        });

        this.child.on("exit", (code, signal) => {
            if (this.hasExited) {
                return;
            }
            this.hasExited = true;
            const error = new Error(
                `Codex app-server exited (${code ?? "null"} / ${signal ?? "null"})`,
            );
            for (const [, pending] of this.pending) {
                pending.reject(error);
            }
            this.pending.clear();
            if (!this.isStopping) {
                this.exitHandler?.(error);
            }
        });
    }

    onNotification(handler: (notification: JsonRpcNotification) => void): void {
        this.notificationHandler = handler;
    }

    onExit(handler: (error: Error) => void): void {
        this.exitHandler = handler;
    }

    async initialize(): Promise<void> {
        await this.request("initialize", {
            clientInfo: {
                name: "agentchat_server",
                title: "Agentchat Server",
                version: "0.2.0",
            },
            capabilities: {
                experimentalApi: true,
            },
        });
        this.notify("initialized", {});
    }

    async request(method: string, params: unknown): Promise<unknown> {
        const id = this.nextId++;

        return await new Promise<unknown>((resolve, reject) => {
            this.pending.set(id, { resolve, reject });
            this.child.stdin.write(
                toJsonLine({
                    id,
                    method,
                    params,
                }),
            );
        });
    }

    private notify(method: string, params: unknown): void {
        this.child.stdin.write(
            toJsonLine({
                method,
                params,
            }),
        );
    }

    stop(): void {
        this.isStopping = true;
        this.child.kill("SIGTERM");
    }
}
