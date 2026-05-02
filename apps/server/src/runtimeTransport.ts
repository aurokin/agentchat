import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type { Readable } from "node:stream";

export type RuntimeProcessExit =
    | {
          type: "error";
          error: Error;
      }
    | {
          type: "exit";
          code: number | null;
          signal: NodeJS.Signals | null;
      };

export type RuntimeProcessStopPolicy = {
    gracefulSignal?: NodeJS.Signals;
    forceSignal?: NodeJS.Signals;
};

export type RuntimeJsonRpcResponse = {
    id?: number | string;
    result?: unknown;
    error?: {
        code: number;
        message: string;
    };
};

export type RuntimeJsonRpcNotification = {
    method?: string;
    params?: Record<string, unknown>;
};

export type RuntimeJsonRpcRequest = {
    id: number | string;
    method: string;
    params?: unknown;
};

export class JsonRpcRequestError extends Error {
    readonly code: number;

    constructor(code: number, message: string) {
        super(message);
        this.name = "JsonRpcRequestError";
        this.code = code;
    }
}

export type JsonlParseError = {
    line: string;
    error: unknown;
};

function toJsonLine(value: unknown): string {
    return `${JSON.stringify(value)}\n`;
}

function processExitToError(label: string, exit: RuntimeProcessExit): Error {
    if (exit.type === "error") {
        return exit.error;
    }

    return new Error(
        `${label} exited (${exit.code ?? "null"} / ${exit.signal ?? "null"})`,
    );
}

export class JsonlStreamParser {
    private buffer = "";
    private readonly onValue: (value: unknown) => void;
    private readonly onError: (error: JsonlParseError) => void;

    constructor(params: {
        onValue: (value: unknown) => void;
        onError: (error: JsonlParseError) => void;
    }) {
        this.onValue = params.onValue;
        this.onError = params.onError;
    }

    push(chunk: string | Buffer): void {
        this.buffer += chunk.toString();

        while (true) {
            const newlineIndex = this.buffer.indexOf("\n");
            if (newlineIndex === -1) {
                return;
            }

            const line = this.buffer.slice(0, newlineIndex);
            this.buffer = this.buffer.slice(newlineIndex + 1);
            this.parseLine(line);
        }
    }

    end(): void {
        if (!this.buffer.trim()) {
            this.buffer = "";
            return;
        }

        const line = this.buffer;
        this.buffer = "";
        this.parseLine(line);
    }

    private parseLine(line: string): void {
        if (!line.trim()) {
            return;
        }

        try {
            this.onValue(JSON.parse(line) as unknown);
        } catch (error) {
            this.onError({ line, error });
        }
    }
}

export class ManagedRuntimeProcess {
    private static readonly DEFAULT_STOP_TIMEOUT_MS = 5_000;

    readonly stdin: ChildProcessWithoutNullStreams["stdin"];
    readonly stdout: ChildProcessWithoutNullStreams["stdout"];
    readonly stderr: ChildProcessWithoutNullStreams["stderr"];

    private readonly child: ChildProcessWithoutNullStreams;
    private readonly label: string;
    private readonly stopTimeoutMs: number;
    private readonly stopPolicy: Required<RuntimeProcessStopPolicy>;
    private readonly exitHandlers = new Set<
        (exit: RuntimeProcessExit) => void
    >();
    private readonly exitPromise: Promise<RuntimeProcessExit>;
    private readonly resolveExitPromise: (exit: RuntimeProcessExit) => void;
    private stopPromise: Promise<void> | null = null;
    private exit: RuntimeProcessExit | null = null;
    private stopping = false;

    constructor(params: {
        command: string;
        args: string[];
        cwd: string;
        env?: NodeJS.ProcessEnv;
        label: string;
        stopTimeoutMs?: number;
        stopPolicy?: RuntimeProcessStopPolicy;
        onStderr?: (chunk: string) => void;
    }) {
        this.label = params.label;
        this.stopTimeoutMs =
            params.stopTimeoutMs ??
            ManagedRuntimeProcess.DEFAULT_STOP_TIMEOUT_MS;
        this.stopPolicy = {
            gracefulSignal: params.stopPolicy?.gracefulSignal ?? "SIGTERM",
            forceSignal: params.stopPolicy?.forceSignal ?? "SIGKILL",
        };
        let resolveExitPromise!: (exit: RuntimeProcessExit) => void;
        this.exitPromise = new Promise<RuntimeProcessExit>((resolve) => {
            resolveExitPromise = resolve;
        });
        this.resolveExitPromise = resolveExitPromise;

        this.child = spawn(params.command, params.args, {
            cwd: params.cwd,
            env: params.env,
            stdio: "pipe",
        });
        this.stdin = this.child.stdin;
        this.stdout = this.child.stdout;
        this.stderr = this.child.stderr;

        this.stderr.on("data", (chunk) => {
            params.onStderr?.(chunk.toString());
        });

        this.child.on("error", (error) => {
            this.settle({ type: "error", error });
        });

        this.child.on("exit", (code, signal) => {
            this.settle({ type: "exit", code, signal });
        });
    }

    get hasExited(): boolean {
        return this.exit !== null;
    }

    get isStopping(): boolean {
        return this.stopping;
    }

    onExit(handler: (exit: RuntimeProcessExit) => void): void {
        this.exitHandlers.add(handler);
    }

    async stop(): Promise<void> {
        if (this.stopPromise) {
            return await this.stopPromise;
        }

        this.stopping = true;
        if (this.hasExited) {
            return;
        }

        this.stopPromise = (async () => {
            this.tryKill(this.stopPolicy.gracefulSignal);
            if (await this.waitForExit(this.stopTimeoutMs)) {
                return;
            }

            this.tryKill(this.stopPolicy.forceSignal);
            if (await this.waitForExit(this.stopTimeoutMs)) {
                return;
            }

            throw new Error(
                `${this.label} did not exit within ${this.stopTimeoutMs}ms after ${this.stopPolicy.gracefulSignal}/${this.stopPolicy.forceSignal}`,
            );
        })();

        try {
            await this.stopPromise;
        } finally {
            this.stopPromise = null;
        }
    }

    private settle(exit: RuntimeProcessExit): void {
        if (this.exit) {
            return;
        }

        this.exit = exit;
        this.resolveExitPromise(exit);
        for (const handler of this.exitHandlers) {
            handler(exit);
        }
    }

    private tryKill(signal: NodeJS.Signals): void {
        if (this.hasExited) {
            return;
        }

        try {
            this.child.kill(signal);
        } catch (error) {
            if (!this.hasExited) {
                throw error;
            }
        }
    }

    private async waitForExit(timeoutMs: number): Promise<boolean> {
        let timeoutId: ReturnType<typeof setTimeout> | null = null;

        try {
            return await Promise.race([
                this.exitPromise.then(() => true),
                new Promise<boolean>((resolve) => {
                    timeoutId = setTimeout(() => {
                        timeoutId = null;
                        resolve(false);
                    }, timeoutMs);
                }),
            ]);
        } finally {
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
        }
    }
}

export class JsonRpcStdioClient {
    private readonly pending = new Map<
        number,
        {
            resolve: (result: unknown) => void;
            reject: (error: Error) => void;
        }
    >();
    private readonly process: ManagedRuntimeProcess;
    private readonly label: string;
    private nextId = 1;
    private notificationHandler:
        | ((notification: RuntimeJsonRpcNotification) => void)
        | null = null;
    private exitHandler: ((error: Error) => void) | null = null;
    private requestHandler:
        | ((request: RuntimeJsonRpcRequest) => Promise<unknown> | unknown)
        | null = null;

    constructor(params: {
        process: ManagedRuntimeProcess;
        label: string;
        onParseError?: (error: JsonlParseError) => void;
    }) {
        this.process = params.process;
        this.label = params.label;

        attachJsonlParser(this.process.stdout, {
            onValue: (value) => this.handleMessage(value),
            onError: (error) => params.onParseError?.(error),
        });

        this.process.onExit((exit) => {
            const error = processExitToError(this.label, exit);
            for (const [, pending] of this.pending) {
                pending.reject(error);
            }
            this.pending.clear();
            if (!this.process.isStopping) {
                this.exitHandler?.(error);
            }
        });
    }

    onNotification(
        handler: (notification: RuntimeJsonRpcNotification) => void,
    ): void {
        this.notificationHandler = handler;
    }

    onExit(handler: (error: Error) => void): void {
        this.exitHandler = handler;
    }

    onRequest(
        handler: (request: RuntimeJsonRpcRequest) => Promise<unknown> | unknown,
    ): void {
        this.requestHandler = handler;
    }

    async request(method: string, params: unknown): Promise<unknown> {
        const id = this.nextId++;

        return await new Promise<unknown>((resolve, reject) => {
            this.pending.set(id, { resolve, reject });
            this.process.stdin.write(
                toJsonLine({
                    jsonrpc: "2.0",
                    id,
                    method,
                    params,
                }),
            );
        });
    }

    notify(method: string, params: unknown): void {
        this.process.stdin.write(
            toJsonLine({
                jsonrpc: "2.0",
                method,
                params,
            }),
        );
    }

    private handleMessage(value: unknown): void {
        if (!isRecord(value)) {
            this.notificationHandler?.({ params: { value } });
            return;
        }

        if (
            "id" in value &&
            value.id !== undefined &&
            typeof value.method === "string"
        ) {
            void this.handleRequest(value as RuntimeJsonRpcRequest);
            return;
        }

        if ("id" in value && value.id !== undefined) {
            this.handleResponse(value as RuntimeJsonRpcResponse);
            return;
        }

        this.notificationHandler?.(value as RuntimeJsonRpcNotification);
    }

    private async handleRequest(request: RuntimeJsonRpcRequest): Promise<void> {
        if (!this.requestHandler) {
            this.process.stdin.write(
                toJsonLine({
                    jsonrpc: "2.0",
                    id: request.id,
                    error: {
                        code: -32601,
                        message: `No handler registered for JSON-RPC request '${request.method}'.`,
                    },
                }),
            );
            return;
        }

        try {
            const result = await this.requestHandler(request);
            this.process.stdin.write(
                toJsonLine({
                    jsonrpc: "2.0",
                    id: request.id,
                    result,
                }),
            );
        } catch (error) {
            this.process.stdin.write(
                toJsonLine({
                    jsonrpc: "2.0",
                    id: request.id,
                    error: {
                        code:
                            error instanceof JsonRpcRequestError
                                ? error.code
                                : -32603,
                        message:
                            error instanceof Error
                                ? error.message
                                : String(error),
                    },
                }),
            );
        }
    }

    private handleResponse(response: RuntimeJsonRpcResponse): void {
        const requestId =
            typeof response.id === "number"
                ? response.id
                : Number.parseInt(String(response.id), 10);
        const pending = this.pending.get(requestId);
        if (!pending) {
            return;
        }
        this.pending.delete(requestId);

        if (response.error?.message) {
            pending.reject(new Error(response.error.message));
            return;
        }

        pending.resolve(response.result);
    }
}

export function attachJsonlParser(
    input: Readable,
    params: {
        onValue: (value: unknown) => void;
        onError: (error: JsonlParseError) => void;
    },
): JsonlStreamParser {
    const parser = new JsonlStreamParser(params);
    input.on("data", (chunk) => {
        parser.push(chunk as Buffer);
    });
    input.on("end", () => {
        parser.end();
    });
    return parser;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}
