import { describe, expect, it } from "bun:test";
import {
    getPreferredHomeChatId,
    resolveRouteChatSelection,
} from "../home-chat-route";

describe("getPreferredHomeChatId", () => {
    const chats = [
        {
            id: "chat-1",
            agentId: "agent-1",
            title: "One",
            modelId: "model-a",
            variantId: null,
            settingsLockedAt: null,
            createdAt: 1,
            updatedAt: 2,
        },
        {
            id: "chat-2",
            agentId: "agent-1",
            title: "Two",
            modelId: "model-a",
            variantId: null,
            settingsLockedAt: null,
            createdAt: 1,
            updatedAt: 3,
        },
    ];

    it("prefers the current chat when it is still in scope", () => {
        expect(
            getPreferredHomeChatId({
                currentChatId: "chat-2",
                currentChatAgentId: "agent-1",
                chats,
            }),
        ).toBe("chat-2");
    });

    it("falls back to the first chat when the current chat is out of scope", () => {
        expect(
            getPreferredHomeChatId({
                currentChatId: "chat-3",
                currentChatAgentId: "agent-1",
                chats,
            }),
        ).toBe("chat-1");
    });

    it("returns null when there are no chats", () => {
        expect(
            getPreferredHomeChatId({
                currentChatId: null,
                currentChatAgentId: null,
                chats: [],
            }),
        ).toBeNull();
    });

    it("does not preserve the old agent when the same local id exists under a new agent", () => {
        const collidedChats = [
            {
                ...chats[0],
                id: "shared-chat",
            },
            {
                ...chats[1],
                id: "shared-chat",
                agentId: "agent-2",
            },
        ];

        expect(
            getPreferredHomeChatId({
                currentChatId: "shared-chat",
                currentChatAgentId: "agent-1",
                chats: collidedChats.filter(
                    (chat) => chat.agentId === "agent-2",
                ),
            }),
        ).toBe("shared-chat");
    });

    it("reselects the route chat when the current chat belongs to another agent", () => {
        const routeChat = resolveRouteChatSelection({
            routeChatId: "shared-chat",
            chats: [
                {
                    ...chats[0],
                    id: "shared-chat",
                    agentId: "agent-2",
                },
            ],
            currentChat: {
                ...chats[0],
                id: "shared-chat",
                agentId: "agent-1",
            },
        });

        expect(routeChat).toMatchObject({
            id: "shared-chat",
            agentId: "agent-2",
        });
    });
});
