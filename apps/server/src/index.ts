import {
    authenticateBackendRequest,
    toConnectionReadyEvent,
} from "./backendAuth.ts";
import { ConfigStore } from "./config.ts";
import { createFetchHandler } from "./http.ts";

const configStore = new ConfigStore();
configStore.watch();

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
        message() {},
    },
});

console.log(
    `[agentchat-server] listening on http://${server.hostname}:${server.port}`,
);
console.log(`[agentchat-server] using config ${configStore.path}`);
