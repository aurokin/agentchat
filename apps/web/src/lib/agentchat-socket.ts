"use client";

import { getAgentchatServerUrl } from "@/lib/agentchat-server";
import { generateUUID } from "@/lib/utils";
import {
    AgentchatSocketClient as SharedAgentchatSocketClient,
    toAgentchatWebSocketUrl,
    type AgentchatSocketCommand,
    type AgentchatSocketEvent,
    type ConversationDeleteCommand,
    type ConversationHistoryEntry,
    type ConversationInterruptCommand,
    type ConversationSendCommand,
    type ConversationSubscriptionCommand,
} from "@shared/core/agentchat-socket";

export type {
    AgentchatSocketCommand,
    AgentchatSocketEvent,
    ConversationDeleteCommand,
    ConversationHistoryEntry,
    ConversationInterruptCommand,
    ConversationSendCommand,
    ConversationSubscriptionCommand,
};

export function getAgentchatWebSocketUrl(): string | null {
    const baseUrl = getAgentchatServerUrl();
    if (!baseUrl) {
        return null;
    }

    return toAgentchatWebSocketUrl(baseUrl);
}

export class AgentchatSocketClient extends SharedAgentchatSocketClient {
    constructor() {
        super({
            getWebSocketUrl: getAgentchatWebSocketUrl,
            createId: generateUUID,
            notConfiguredMessage:
                "NEXT_PUBLIC_AGENTCHAT_SERVER_URL is not configured for the web app.",
        });
    }
}

let sharedAgentchatSocketClient: AgentchatSocketClient | null = null;

export function getSharedAgentchatSocketClient(): AgentchatSocketClient {
    sharedAgentchatSocketClient ??= new AgentchatSocketClient();
    return sharedAgentchatSocketClient;
}
