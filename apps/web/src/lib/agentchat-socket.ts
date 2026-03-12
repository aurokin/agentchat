"use client";

import { getAgentchatServerUrl } from "@/lib/agentchat-server";
import type { ThinkingLevel } from "@/lib/types";

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
        thinking: ThinkingLevel;
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
    };
}

export type AgentchatSocketCommand =
    | ConversationSendCommand
    | ConversationInterruptCommand;

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

export function getAgentchatWebSocketUrl(): string | null {
    const baseUrl = getAgentchatServerUrl();
    if (!baseUrl) {
        return null;
    }

    return toAgentchatWebSocketUrl(baseUrl);
}

function parseEvent(raw: string): AgentchatSocketEvent | null {
    try {
        return JSON.parse(raw) as AgentchatSocketEvent;
    } catch (error) {
        console.error("Failed to parse Agentchat socket event:", error);
        return null;
    }
}

export class AgentchatSocketClient {
    private socket: WebSocket | null = null;
    private connectPromise: Promise<void> | null = null;
    private readonly listeners = new Set<AgentchatSocketListener>();
    private ready = false;

    async ensureConnected(tokenIssuer: TokenIssuer): Promise<void> {
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

    send(command: AgentchatSocketCommand): void {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            throw new Error("Agentchat socket is not connected.");
        }

        this.socket.send(JSON.stringify(command));
    }

    close(): void {
        this.socket?.close();
        this.socket = null;
        this.ready = false;
    }

    private async connect(tokenIssuer: TokenIssuer): Promise<void> {
        const wsUrl = getAgentchatWebSocketUrl();
        if (!wsUrl) {
            throw new Error(
                "NEXT_PUBLIC_AGENTCHAT_SERVER_URL is not configured for the web app.",
            );
        }

        const token = await tokenIssuer();
        const url = new URL(wsUrl);
        url.searchParams.set("token", token);

        await new Promise<void>((resolve, reject) => {
            const socket = new WebSocket(url);
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

                if (parsed.type === "connection.ready") {
                    this.ready = true;
                    settleResolve();
                }

                if (parsed.type === "connection.error" && !this.ready) {
                    settleReject(new Error(parsed.payload.message));
                }

                for (const listener of this.listeners) {
                    listener(parsed);
                }
            };

            socket.onerror = () => {
                settleReject(
                    new Error("Failed to connect to Agentchat server."),
                );
            };

            socket.onclose = () => {
                if (this.socket === socket) {
                    this.socket = null;
                    this.ready = false;
                }

                if (!settled) {
                    settleReject(
                        new Error(
                            "Agentchat server closed the websocket before it became ready.",
                        ),
                    );
                }
            };
        });
    }
}

let sharedAgentchatSocketClient: AgentchatSocketClient | null = null;

export function getSharedAgentchatSocketClient(): AgentchatSocketClient {
    sharedAgentchatSocketClient ??= new AgentchatSocketClient();
    return sharedAgentchatSocketClient;
}
