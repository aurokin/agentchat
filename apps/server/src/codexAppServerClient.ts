import type { AgentConfig, CodexProviderConfig } from "./config.ts";
import {
    JsonRpcStdioClient,
    ManagedRuntimeProcess,
    type RuntimeJsonRpcNotification,
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

export class CodexAppServerClient implements CodexClient {
    private static readonly DEFAULT_STOP_TIMEOUT_MS = 5_000;

    private readonly process: ManagedRuntimeProcess;
    private readonly rpc: JsonRpcStdioClient;

    constructor(params: {
        provider: CodexProviderConfig;
        agent: AgentConfig;
        stopTimeoutMs?: number;
    }) {
        const { provider } = params;
        this.process = new ManagedRuntimeProcess({
            command: provider.codex.command,
            args: provider.codex.args,
            cwd: provider.codex.cwd ?? params.agent.rootPath,
            env: {
                ...process.env,
                ...provider.codex.baseEnv,
            },
            label: "Codex app-server",
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
