export interface ConversationHistoryEntry {
    role: "user" | "assistant" | "system";
    content: string;
}

export interface ConversationSendCommand {
    id: string;
    type: "conversation.send";
    payload: {
        conversationId: string;
        agentId: string;
        modelId: string;
        variantId?: string | null;
        content: string;
        userMessageId: string;
        assistantMessageId: string;
        history: ConversationHistoryEntry[];
    };
}

export interface ConversationInterruptCommand {
    id: string;
    type: "conversation.interrupt";
    payload: {
        conversationId: string;
        agentId: string;
    };
}

export interface ConversationSubscriptionCommand {
    id: string;
    type: "conversation.subscribe" | "conversation.unsubscribe";
    payload: {
        conversationId: string;
        agentId: string;
    };
}

export interface ConversationDeleteCommand {
    id: string;
    type: "conversation.delete";
    payload: {
        conversationId: string;
        agentId: string;
    };
}

export type AgentchatSocketCommand =
    | ConversationSendCommand
    | ConversationInterruptCommand
    | ConversationSubscriptionCommand
    | ConversationDeleteCommand;

export type AgentchatSocketEvent =
    | {
          type: "connection.ready";
          payload: {
              user: {
                  sub: string;
                  userId: string;
                  email: string;
              };
              transport: "websocket";
          };
      }
    | {
          type: "connection.reconnected";
          payload: {
              transport: "websocket";
          };
      }
    | {
          type: "connection.error";
          payload: {
              message: string;
          };
      }
    | {
          type: "run.started";
          payload: {
              conversationId: string;
              runId: string;
              messageId: string;
          };
      }
    | {
          type: "message.started";
          payload: {
              conversationId: string;
              runId: string;
              messageId: string;
              messageIndex: number;
              kind: "assistant_message" | "assistant_status";
              content: string;
              previousMessageId?: string;
              previousKind?: "assistant_message" | "assistant_status";
          };
      }
    | {
          type: "run.completed" | "run.interrupted";
          payload: {
              conversationId: string;
              runId: string;
          };
      }
    | {
          type: "run.failed";
          payload: {
              conversationId: string;
              runId: string;
              error: {
                  message: string;
              };
          };
      }
    | {
          type: "message.delta";
          payload: {
              conversationId: string;
              messageId: string;
              delta: string;
              content: string;
          };
      }
    | {
          type: "message.completed";
          payload: {
              conversationId: string;
              messageId: string;
              content: string;
          };
      };

type TokenIssuer = () => Promise<string>;
type AgentchatSocketListener = (event: AgentchatSocketEvent) => void;

export function toAgentchatWebSocketUrl(baseUrl: string): string {
    const url = new URL(baseUrl);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.pathname = "/ws";
    url.search = "";
    url.hash = "";
    return url.toString();
}

function parseEvent(raw: string): AgentchatSocketEvent | null {
    try {
        return JSON.parse(raw) as AgentchatSocketEvent;
    } catch (error) {
        console.error("Failed to parse Agentchat socket event:", error);
        return null;
    }
}

export interface AgentchatSocketClientOptions {
    getWebSocketUrl: () => string | null;
    createId: () => string;
    notConfiguredMessage: string;
}

export class AgentchatSocketClient {
    private socket: WebSocket | null = null;
    private connectPromise: Promise<void> | null = null;
    private readonly listeners = new Set<AgentchatSocketListener>();
    private readonly conversationSubscriptions = new Map<
        string,
        {
            conversationId: string;
            agentId: string;
            subscriptionCount: number;
        }
    >();
    private ready = false;
    private tokenIssuer: TokenIssuer | null = null;
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private reconnectDelayMs = 500;
    private explicitlyClosed = false;
    private pendingReconnectEvent = false;

    constructor(private readonly options: AgentchatSocketClientOptions) {}

    async ensureConnected(tokenIssuer: TokenIssuer): Promise<void> {
        this.tokenIssuer = tokenIssuer;
        this.explicitlyClosed = false;

        if (this.socket?.readyState === WebSocket.OPEN && this.ready) {
            return;
        }

        if (this.connectPromise) {
            await this.connectPromise;
            return;
        }

        this.connectPromise = this.connect(tokenIssuer).finally(() => {
            this.connectPromise = null;
        });
        await this.connectPromise;
    }

    subscribe(listener: AgentchatSocketListener): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    subscribeToConversation(
        conversationId: string,
        agentId: string,
    ): () => void {
        const key = this.getConversationSubscriptionKey(
            conversationId,
            agentId,
        );
        const existing = this.conversationSubscriptions.get(key);
        const nextCount = (existing?.subscriptionCount ?? 0) + 1;
        this.conversationSubscriptions.set(key, {
            conversationId,
            agentId,
            subscriptionCount: nextCount,
        });
        if (nextCount === 1) {
            this.sendConversationSubscription(
                "conversation.subscribe",
                conversationId,
                agentId,
            );
        }

        return () => {
            const currentCount =
                this.conversationSubscriptions.get(key)?.subscriptionCount ?? 0;
            if (currentCount <= 1) {
                this.conversationSubscriptions.delete(key);
                this.sendConversationSubscription(
                    "conversation.unsubscribe",
                    conversationId,
                    agentId,
                );
                return;
            }

            this.conversationSubscriptions.set(key, {
                conversationId,
                agentId,
                subscriptionCount: currentCount - 1,
            });
        };
    }

    send(command: AgentchatSocketCommand): void {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            throw new Error("Agentchat socket is not connected.");
        }

        this.socket.send(JSON.stringify(command));
    }

    /**
     * Best-effort notification to the server that a conversation was deleted,
     * so it can clean up any sandbox workspace. Connects first if needed
     * and a token issuer is available; otherwise silently ignored.
     */
    async notifyConversationDeleted(
        conversationId: string,
        agentId: string,
        tokenIssuer?: (() => Promise<string>) | null,
    ): Promise<void> {
        const effectiveTokenIssuer = tokenIssuer ?? this.tokenIssuer;
        if (
            (!this.socket || this.socket.readyState !== WebSocket.OPEN) &&
            effectiveTokenIssuer
        ) {
            try {
                await this.ensureConnected(effectiveTokenIssuer);
            } catch {
                return;
            }
        }

        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            return;
        }

        this.socket.send(
            JSON.stringify({
                id: this.options.createId(),
                type: "conversation.delete",
                payload: { conversationId, agentId },
            } satisfies ConversationDeleteCommand),
        );
    }

    close(): void {
        this.explicitlyClosed = true;
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        this.socket?.close();
        this.socket = null;
        this.ready = false;
    }

    private async connect(tokenIssuer: TokenIssuer): Promise<void> {
        const wsUrl = this.options.getWebSocketUrl();
        if (!wsUrl) {
            throw new Error(this.options.notConfiguredMessage);
        }

        const token = await tokenIssuer();
        const url = new URL(wsUrl);
        url.searchParams.set("token", token);

        await new Promise<void>((resolve, reject) => {
            const socket = new WebSocket(url.toString());
            let settled = false;

            const settleResolve = () => {
                if (settled) return;
                settled = true;
                resolve();
            };

            const settleReject = (error: Error) => {
                if (settled) return;
                settled = true;
                reject(error);
            };

            socket.onopen = () => {
                this.socket = socket;
            };

            socket.onmessage = (event) => {
                const parsed = parseEvent(String(event.data));
                if (!parsed) {
                    return;
                }

                let reconnectEvent: AgentchatSocketEvent | null = null;

                if (parsed.type === "connection.ready") {
                    if (this.pendingReconnectEvent) {
                        reconnectEvent = {
                            type: "connection.reconnected",
                            payload: {
                                transport: "websocket",
                            },
                        };
                        this.pendingReconnectEvent = false;
                    }
                    this.ready = true;
                    this.reconnectDelayMs = 500;
                    this.replayConversationSubscriptions();
                    settleResolve();
                }

                if (parsed.type === "connection.error" && !this.ready) {
                    settleReject(new Error(parsed.payload.message));
                }

                for (const listener of this.listeners) {
                    listener(parsed);
                }

                if (reconnectEvent) {
                    for (const listener of this.listeners) {
                        listener(reconnectEvent);
                    }
                }
            };

            socket.onerror = () => {
                settleReject(
                    new Error("Failed to connect to Agentchat server."),
                );
            };

            socket.onclose = () => {
                const wasReady = this.ready;
                if (this.socket === socket) {
                    this.socket = null;
                    this.ready = false;
                }

                if (wasReady && !this.explicitlyClosed) {
                    this.pendingReconnectEvent = true;
                }

                if (!settled) {
                    settleReject(
                        new Error(
                            "Agentchat server closed the websocket before it became ready.",
                        ),
                    );
                }

                this.scheduleReconnect();
            };
        });
    }

    private replayConversationSubscriptions(): void {
        for (const subscription of this.conversationSubscriptions.values()) {
            this.sendConversationSubscription(
                "conversation.subscribe",
                subscription.conversationId,
                subscription.agentId,
            );
        }
    }

    private getConversationSubscriptionKey(
        conversationId: string,
        agentId: string,
    ): string {
        return `${agentId}:${conversationId}`;
    }

    private sendConversationSubscription(
        type: "conversation.subscribe" | "conversation.unsubscribe",
        conversationId: string,
        agentId: string,
    ): void {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            return;
        }

        this.socket.send(
            JSON.stringify({
                id: this.options.createId(),
                type,
                payload: {
                    conversationId,
                    agentId,
                },
            } satisfies ConversationSubscriptionCommand),
        );
    }

    private scheduleReconnect(): void {
        if (this.explicitlyClosed || !this.tokenIssuer || this.reconnectTimer) {
            return;
        }

        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            if (this.explicitlyClosed || !this.tokenIssuer) {
                return;
            }

            this.ensureConnected(this.tokenIssuer).catch((error) => {
                console.error(
                    "Failed to reconnect to Agentchat server:",
                    error,
                );
                this.reconnectDelayMs = Math.min(
                    this.reconnectDelayMs * 2,
                    5000,
                );
                this.scheduleReconnect();
            });
        }, this.reconnectDelayMs);
    }
}
