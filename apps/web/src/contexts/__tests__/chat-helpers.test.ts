import { describe, expect, test } from "bun:test";

import {
    filterChatsForAgent,
    resolveCurrentChatForAgent,
} from "../chat-helpers";
import type { ChatSession } from "@/lib/types";

const chats: ChatSession[] = [
    {
        id: "chat-a",
        agentId: "agent-a",
        title: "Alpha",
        modelId: "gpt-5.3-codex",
        createdAt: 1,
        updatedAt: 3,
    },
    {
        id: "chat-b",
        agentId: "agent-b",
        title: "Beta",
        modelId: "gpt-5.3-codex",
        createdAt: 2,
        updatedAt: 4,
    },
];

describe("chat helpers", () => {
    test("filters chats to the selected agent", () => {
        expect(
            filterChatsForAgent(chats, "agent-a").map((chat) => chat.id),
        ).toEqual(["chat-a"]);
    });

    test("returns no chats when no agent is selected", () => {
        expect(filterChatsForAgent(chats, null)).toEqual([]);
    });

    test("clears the current chat when it no longer exists in the active agent scope", () => {
        expect(
            resolveCurrentChatForAgent({
                chats: filterChatsForAgent(chats, "agent-a"),
                currentChat: chats[1] ?? null,
                selectedAgentId: "agent-a",
            }),
        ).toBeNull();
    });

    test("preserves the current chat when it remains in scope", () => {
        expect(
            resolveCurrentChatForAgent({
                chats: filterChatsForAgent(chats, "agent-a"),
                currentChat: chats[0] ?? null,
                selectedAgentId: "agent-a",
            })?.id,
        ).toBe("chat-a");
    });

    test("does not preserve a different agent's chat when local ids collide", () => {
        const sameLocalIdChats: ChatSession[] = [
            {
                ...chats[0]!,
                id: "shared-chat",
            },
            {
                ...chats[1]!,
                id: "shared-chat",
            },
        ];

        expect(
            resolveCurrentChatForAgent({
                chats: filterChatsForAgent(sameLocalIdChats, "agent-a"),
                currentChat: sameLocalIdChats[1] ?? null,
                selectedAgentId: "agent-a",
            }),
        ).toBeNull();
    });

    test("falls back to the stored chat when no current chat is loaded", () => {
        expect(
            resolveCurrentChatForAgent({
                chats: filterChatsForAgent(chats, "agent-a"),
                currentChat: null,
                selectedAgentId: "agent-a",
                storedChatId: "chat-a",
            })?.id,
        ).toBe("chat-a");
    });

    test("does not preserve a current chat from another agent", () => {
        expect(
            resolveCurrentChatForAgent({
                chats: filterChatsForAgent(chats, "agent-a"),
                currentChat: chats[1] ?? null,
                selectedAgentId: "agent-a",
                storedChatId: "chat-b",
            }),
        ).toBeNull();
    });
});
