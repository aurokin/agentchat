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

        const activeCount = reconcileBackgroundConversationSubscriptions({
            subscriptions,
            desiredConversationIds: ["chat-2", "chat-3", "chat-3"],
            subscribeToConversation: (conversationId) => {
                calls.push(`subscribe:${conversationId}`);
                return () => {
                    calls.push(`unsubscribe:${conversationId}`);
                };
            },
        });

        expect(activeCount).toBe(2);
        expect(calls).toEqual(["unsubscribe:chat-1", "subscribe:chat-3"]);
        expect([...subscriptions.keys()]).toEqual(["chat-2", "chat-3"]);
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
