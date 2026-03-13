import { v4 as uuidv4 } from "uuid";
import {
    AgentchatSocketClient as SharedAgentchatSocketClient,
    toAgentchatWebSocketUrl,
    type AgentchatSocketCommand,
    type AgentchatSocketEvent,
    type ConversationHistoryEntry,
    type ConversationInterruptCommand,
    type ConversationSendCommand,
    type ConversationSubscriptionCommand,
} from "@shared/core/agentchat-socket";
import { getAgentchatServerUrl } from "@/lib/agentchat-server";

export type {
    AgentchatSocketCommand,
    AgentchatSocketEvent,
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
            createId: uuidv4,
            notConfiguredMessage:
                "EXPO_PUBLIC_AGENTCHAT_SERVER_URL is not configured for the mobile app.",
        });
    }
}

let sharedAgentchatSocketClient: AgentchatSocketClient | null = null;

export function getSharedAgentchatSocketClient(): AgentchatSocketClient {
    sharedAgentchatSocketClient ??= new AgentchatSocketClient();
    return sharedAgentchatSocketClient;
}
