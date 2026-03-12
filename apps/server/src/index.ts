import {
    authenticateBackendRequest,
    toConnectionReadyEvent,
} from "./backendAuth.ts";
import { ConfigStore } from "./config.ts";
import { CodexRuntimeManager } from "./codexRuntime.ts";
import { createFetchHandler } from "./http.ts";
import { parseClientCommand, type ServerEvent } from "./socketProtocol.ts";

const configStore = new ConfigStore();
configStore.watch();
const runtimeManager = new CodexRuntimeManager({
    getConfig: () => configStore.snapshot,
});

type WebSocketData = {
    session: {
        sub: string;
        email: string;
        iat: number;
        exp: number;
    };
};

const httpFetch = createFetchHandler({
    getConfig: () => configStore.snapshot,
});

function toServerEventJson(event: ServerEvent): string {
    return JSON.stringify(event);
}

function toConnectionErrorEvent(message: string): string {
    return toServerEventJson({
        type: "connection.error",
        payload: { message },
    });
}

function normalizeSocketMessage(
    message: string | Buffer | ArrayBuffer | Uint8Array,
): string {
    if (typeof message === "string") {
        return message;
    }

    if (message instanceof ArrayBuffer) {
        return new TextDecoder().decode(new Uint8Array(message));
    }

    if (ArrayBuffer.isView(message)) {
        return new TextDecoder().decode(
            new Uint8Array(
                message.buffer,
                message.byteOffset,
                message.byteLength,
            ),
        );
    }

    throw new Error("Unsupported websocket message type");
}

const server = Bun.serve<WebSocketData>({
    hostname: "0.0.0.0",
    port: 3030,
    fetch: async (request, serverRef) => {
        const url = new URL(request.url);
        if (url.pathname === "/ws") {
            try {
                const session = await authenticateBackendRequest(request);
                const upgraded = serverRef.upgrade(request, {
                    data: { session },
                });

                if (upgraded) {
                    return undefined;
                }

                return new Response("WebSocket upgrade failed", {
                    status: 500,
                });
            } catch (error) {
                return Response.json(
                    {
                        error:
                            error instanceof Error
                                ? error.message
                                : "Unauthorized",
                    },
                    { status: 401 },
                );
            }
        }

        return await httpFetch(request);
    },
    websocket: {
        open(ws: Bun.ServerWebSocket<WebSocketData>) {
            if (!ws.data?.session) {
                ws.close(1011, "Missing backend session");
                return;
            }

            ws.send(toConnectionReadyEvent(ws.data.session));
        },
        async message(ws, message) {
            const session = ws.data?.session;
            if (!session) {
                ws.close(1011, "Missing backend session");
                return;
            }

            let commandText: string;
            try {
                commandText = normalizeSocketMessage(message);
            } catch (error) {
                ws.send(
                    toConnectionErrorEvent(
                        error instanceof Error
                            ? error.message
                            : "Invalid websocket message",
                    ),
                );
                return;
            }

            try {
                const command = parseClientCommand(commandText);
                if (command.type === "conversation.interrupt") {
                    await runtimeManager.interrupt({
                        userSub: session.sub,
                        conversationId: command.payload.conversationId,
                    });
                    return;
                }

                await runtimeManager.sendMessage({
                    userSub: session.sub,
                    command,
                    sendEvent: (event) => {
                        ws.send(toServerEventJson(event));
                    },
                });
            } catch (error) {
                ws.send(
                    toConnectionErrorEvent(
                        error instanceof Error
                            ? error.message
                            : "Failed to process websocket command",
                    ),
                );
            }
        },
    },
});

console.log(
    `[agentchat-server] listening on http://${server.hostname}:${server.port}`,
);
console.log(`[agentchat-server] using config ${configStore.path}`);
