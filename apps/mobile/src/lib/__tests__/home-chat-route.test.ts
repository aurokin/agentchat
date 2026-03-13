import { describe, expect, it } from "bun:test";
import { getPreferredHomeChatId } from "../home-chat-route";

describe("getPreferredHomeChatId", () => {
    const chats = [
        {
            id: "chat-1",
            agentId: "agent-1",
            title: "One",
            modelId: "model-a",
            variantId: null,
            thinking: "none" as const,
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
            thinking: "none" as const,
            settingsLockedAt: null,
            createdAt: 1,
            updatedAt: 3,
        },
    ];

    it("prefers the current chat when it is still in scope", () => {
        expect(
            getPreferredHomeChatId({
                currentChatId: "chat-2",
                chats,
            }),
        ).toBe("chat-2");
    });

    it("falls back to the first chat when the current chat is out of scope", () => {
        expect(
            getPreferredHomeChatId({
                currentChatId: "chat-3",
                chats,
            }),
        ).toBe("chat-1");
    });

    it("returns null when there are no chats", () => {
        expect(
            getPreferredHomeChatId({
                currentChatId: null,
                chats: [],
            }),
        ).toBeNull();
    });
});
