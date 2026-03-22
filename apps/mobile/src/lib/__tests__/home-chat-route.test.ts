import { describe, expect, it } from "bun:test";
import {
    buildChatRouteId,
    getPreferredHomeChatRouteId,
    parseChatRouteId,
    resolveRouteChatSelection,
} from "../home-chat-route";

describe("home chat route helpers", () => {
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

    it("builds and parses agent-scoped route ids", () => {
        const routeId = buildChatRouteId({
            chatId: "scoped:chat-1",
            agentId: "agent/one",
        });

        expect(parseChatRouteId(routeId)).toEqual({
            chatId: "scoped:chat-1",
            agentId: "agent/one",
        });
    });

    it("rejects unscoped route ids", () => {
        expect(parseChatRouteId("chat-1")).toBeNull();
    });

    it("rejects malformed scoped route ids", () => {
        expect(parseChatRouteId("agent~agent-only")).toBeNull();
    });

    it("prefers the current chat when it is still in scope", () => {
        expect(
            getPreferredHomeChatRouteId({
                currentChatId: "chat-2",
                currentChatAgentId: "agent-1",
                chats,
            }),
        ).toBe(
            buildChatRouteId({
                chatId: "chat-2",
                agentId: "agent-1",
            }),
        );
    });

    it("falls back to the first chat when the current chat is out of scope", () => {
        expect(
            getPreferredHomeChatRouteId({
                currentChatId: "chat-3",
                currentChatAgentId: "agent-1",
                chats,
            }),
        ).toBe(
            buildChatRouteId({
                chatId: "chat-1",
                agentId: "agent-1",
            }),
        );
    });

    it("returns null when there are no chats", () => {
        expect(
            getPreferredHomeChatRouteId({
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
            getPreferredHomeChatRouteId({
                currentChatId: "shared-chat",
                currentChatAgentId: "agent-1",
                chats: collidedChats.filter(
                    (chat) => chat.agentId === "agent-2",
                ),
            }),
        ).toBe(
            buildChatRouteId({
                chatId: "shared-chat",
                agentId: "agent-2",
            }),
        );
    });

    it("reselects the route chat when the current chat belongs to another agent", () => {
        const routeChat = resolveRouteChatSelection({
            routeChatId: "shared-chat",
            routeAgentId: "agent-2",
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

    it("fails closed when the scoped route does not match an existing chat", () => {
        expect(
            resolveRouteChatSelection({
                routeChatId: "shared-chat",
                routeAgentId: "agent-3",
                chats: [
                    {
                        ...chats[0],
                        id: "shared-chat",
                        agentId: "agent-1",
                    },
                    {
                        ...chats[1],
                        id: "shared-chat",
                        agentId: "agent-2",
                    },
                ],
                currentChat: null,
            }),
        ).toBeNull();
    });
});
