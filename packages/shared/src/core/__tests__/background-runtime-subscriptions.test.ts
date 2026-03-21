import { describe, expect, test } from "bun:test";

import {
    clearBackgroundConversationSubscriptions,
    reconcileBackgroundConversationSubscriptions,
} from "../background-runtime-subscriptions";

describe("background runtime subscriptions", () => {
    test("reconciles subscriptions by adding missing ids and removing stale ones", () => {
        const calls: string[] = [];
        const subscriptions = new Map<string, () => void>([
            [
                "agent-a:chat-1",
                () => {
                    calls.push("unsubscribe:agent-a:chat-1");
                },
            ],
            [
                "agent-a:chat-2",
                () => {
                    calls.push("unsubscribe:agent-a:chat-2");
                },
            ],
        ]);

        const activeCount = reconcileBackgroundConversationSubscriptions({
            subscriptions,
            desiredConversations: [
                { conversationId: "chat-2", agentId: "agent-a" },
                { conversationId: "chat-3", agentId: "agent-b" },
                { conversationId: "chat-3", agentId: "agent-b" },
            ],
            subscribeToConversation: ({ conversationId, agentId }) => {
                calls.push(`subscribe:${agentId}:${conversationId}`);
                return () => {
                    calls.push(`unsubscribe:${agentId}:${conversationId}`);
                };
            },
        });

        expect(activeCount).toBe(2);
        expect(calls).toEqual([
            "unsubscribe:agent-a:chat-1",
            "subscribe:agent-b:chat-3",
        ]);
        expect([...subscriptions.keys()]).toEqual([
            "agent-a:chat-2",
            "agent-b:chat-3",
        ]);
    });

    test("retains background subscriptions while the active conversation query is temporarily unavailable", () => {
        const calls: string[] = [];
        const subscriptions = new Map<string, () => void>([
            [
                "agent-a:chat-1",
                () => {
                    calls.push("unsubscribe:agent-a:chat-1");
                },
            ],
        ]);

        const activeCount = reconcileBackgroundConversationSubscriptions({
            subscriptions,
            desiredConversations: undefined,
            subscribeToConversation: ({ conversationId, agentId }) => {
                calls.push(`subscribe:${agentId}:${conversationId}`);
                return () => {
                    calls.push(`unsubscribe:${agentId}:${conversationId}`);
                };
            },
        });

        expect(activeCount).toBe(1);
        expect(calls).toEqual([]);
        expect([...subscriptions.keys()]).toEqual(["agent-a:chat-1"]);
    });

    test("clears all background subscriptions", () => {
        const calls: string[] = [];
        const subscriptions = new Map<string, () => void>([
            [
                "chat-1",
                () => {
                    calls.push("unsubscribe:chat-1");
                },
            ],
            [
                "chat-2",
                () => {
                    calls.push("unsubscribe:chat-2");
                },
            ],
        ]);

        clearBackgroundConversationSubscriptions(subscriptions);

        expect(calls).toEqual(["unsubscribe:chat-1", "unsubscribe:chat-2"]);
        expect(subscriptions.size).toBe(0);
    });
});
