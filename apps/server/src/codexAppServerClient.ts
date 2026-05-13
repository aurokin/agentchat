import type { AgentConfig, CodexProviderConfig } from "./config.ts";
import {
    JsonRpcStdioClient,
    ManagedRuntimeProcess,
    type RuntimeJsonRpcNotification,
    type RuntimeProcessLike,
} from "./runtimeTransport.ts";

export type JsonRpcNotification = RuntimeJsonRpcNotification;

export type CodexClient = {
    initialize: () => Promise<void>;
    request: (method: string, params: unknown) => Promise<unknown>;
    onNotification: (
        handler: (notification: JsonRpcNotification) => void,
    ) => void;
    onExit: (handler: (error: Error) => void) => void;
    stop: () => Promise<void>;
};

export type CreateCodexClient = (params: {
    provider: CodexProviderConfig;
    agent: AgentConfig;
}) => CodexClient;

type CreateCodexProcess = (params: {
    command: string;
    args: string[];
    cwd: string;
    env: NodeJS.ProcessEnv;
    stopTimeoutMs?: number;
    onStderr: (chunk: string) => void;
}) => RuntimeProcessLike;

export class CodexAppServerClient implements CodexClient {
    private static readonly DEFAULT_STOP_TIMEOUT_MS = 5_000;

    private readonly process: RuntimeProcessLike;
    private readonly rpc: JsonRpcStdioClient;

    constructor(params: {
        provider: CodexProviderConfig;
        agent: AgentConfig;
        stopTimeoutMs?: number;
        createRuntimeProcess?: CreateCodexProcess;
    }) {
        const { provider } = params;
        const createRuntimeProcess: CreateCodexProcess =
            params.createRuntimeProcess ??
            ((processParams) =>
                new ManagedRuntimeProcess({
                    ...processParams,
                    label: "Codex app-server",
                    onStderr: processParams.onStderr,
                }));
        this.process = createRuntimeProcess({
            command: provider.codex.command,
            args: provider.codex.args,
            cwd: provider.codex.cwd ?? params.agent.rootPath,
            env: {
                ...process.env,
                ...provider.codex.baseEnv,
            },
            stopTimeoutMs:
                params.stopTimeoutMs ??
                CodexAppServerClient.DEFAULT_STOP_TIMEOUT_MS,
            onStderr: (chunk) => {
                const text = chunk.trim();
                if (text) {
                    console.error(`[agentchat-server][codex] ${text}`);
                }
            },
        });
        this.rpc = new JsonRpcStdioClient({
            process: this.process,
            label: "Codex app-server",
            onParseError: ({ error }) => {
                console.error("[agentchat-server] invalid codex JSON", error);
            },
        });
    }

    onNotification(handler: (notification: JsonRpcNotification) => void): void {
        this.rpc.onNotification(handler);
    }

    onExit(handler: (error: Error) => void): void {
        this.rpc.onExit(handler);
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
        return await this.rpc.request(method, params);
    }

    private notify(method: string, params: unknown): void {
        this.rpc.notify(method, params);
    }

    async stop(): Promise<void> {
        await this.process.stop();
    }
}
