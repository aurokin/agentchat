import {
    authenticateBackendRequest,
    toConnectionReadyEvent,
} from "./backendAuth.ts";
import { ConfigStore } from "./config.ts";
import { CodexModelCatalog } from "./codexModelCatalog.ts";
import { CodexRuntimeManager } from "./codexRuntime.ts";
import { createFetchHandler } from "./http.ts";
import { RuntimePersistenceClient } from "./runtimePersistence.ts";
import {
    getSandboxRootsRegistryPath,
    WorkspaceManager,
} from "./workspaceManager.ts";
import { resolveDefaultStateId } from "./serverState.ts";
import {
    getPersistedWorkspaceActiveKeys,
    getCopyOnConversationAgentIds,
    shouldSkipPersistedWorkspaceScan,
} from "./workspaceReconciliation.ts";
import {
    handleConnectedSocketMessage,
    handleSocketClose,
    type BackendSession,
} from "./websocketSession.ts";

const configStore = new ConfigStore();
configStore.watch();
const runtimePersistence = new RuntimePersistenceClient();
const modelCatalog = new CodexModelCatalog({
    getConfig: () => configStore.snapshot,
});
const workspaceManager = new WorkspaceManager({
    getConfig: () => configStore.snapshot,
    getRootsRegistryPath: () =>
        getSandboxRootsRegistryPath(
            configStore.snapshot.stateId ??
                resolveDefaultStateId(configStore.path),
        ),
});
const runtimeManager = new CodexRuntimeManager({
    getConfig: () => configStore.snapshot,
    persistence: runtimePersistence,
    workspaceManager,
    stateId:
        configStore.snapshot.stateId ?? resolveDefaultStateId(configStore.path),
});

type WebSocketData = {
    connectionId: string;
    session: BackendSession;
};

const httpFetch = createFetchHandler({
    getConfig: () => configStore.snapshot,
    getConfigStatus: () => configStore.status,
    modelCatalog,
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
                    data: {
                        session,
                        connectionId: crypto.randomUUID(),
                    },
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

            await handleConnectedSocketMessage({
                runtimeManager,
                session,
                connectionId: ws.data.connectionId,
                rawMessage: message,
                sendJson: (payload) => {
                    ws.send(payload);
                },
            });
        },
        close(ws) {
            handleSocketClose({
                runtimeManager,
                connectionId: ws.data.connectionId,
            });
        },
    },
});

console.log(
    `[agentchat-server] listening on http://${server.hostname}:${server.port}`,
);
console.log(`[agentchat-server] using config ${configStore.path}`);

// Sandbox workspace reconciliation — prune orphaned directories on startup
// and every 10 minutes. Best-effort; failures are logged and ignored.
const RECONCILE_INTERVAL_MS = 10 * 60 * 1000;

async function runReconciliation(): Promise<void> {
    try {
        const configuredAgentIds = new Set(
            configStore.snapshot.agents.map((agent) => agent.id),
        );
        const copyOnConversationAgentIds = getCopyOnConversationAgentIds(
            configStore.snapshot.agents,
        );
        const activeRuntimeKeys = runtimeManager.getActiveConversationKeys();
        if (
            shouldSkipPersistedWorkspaceScan({
                copyOnConversationAgentIds,
                activeWorkspaceKeys: activeRuntimeKeys,
                hasManagedWorkspaces: workspaceManager.hasManagedWorkspaces(),
            })
        ) {
            return;
        }

        const entries = await runtimePersistence.listAllChatLocalIds();
        // Build composite keys so reconciliation can distinguish sandboxes
        // across agents, users, and client-supplied localIds.
        const activeKeys = getPersistedWorkspaceActiveKeys(entries, {
            copyOnConversationAgentIds,
            configuredAgentIds,
            currentSandboxRoot: configStore.snapshot.sandboxRoot,
            knownSandboxRoots: workspaceManager.listKnownSandboxRoots(),
        });
        // Include live runtimes to avoid deleting sandboxes for in-progress
        // sessions not yet persisted to Convex.
        for (const key of activeRuntimeKeys) {
            activeKeys.add(key);
        }
        await workspaceManager.reconcile(activeKeys);
    } catch (error) {
        console.error(
            "[agentchat-server] workspace reconciliation failed:",
            error,
        );
    }
}

void runReconciliation();
setInterval(() => void runReconciliation(), RECONCILE_INTERVAL_MS);
