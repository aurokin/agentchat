import { describe, expect, test } from "bun:test";

import { resolveConversationActivityState } from "@shared/core/conversation-activity";
import { getScopedChatTargetKey } from "../Sidebar";

describe("resolveConversationActivityState", () => {
    test("marks active runs as working", () => {
        expect(
            resolveConversationActivityState({
                isActiveConversation: false,
                activity: {
                    label: "Working",
                    tone: "working",
                },
            }),
        ).toEqual({
            label: "Working",
            tone: "working",
        });
    });

    test("marks finished unseen activity as a new reply", () => {
        expect(
            resolveConversationActivityState({
                isActiveConversation: false,
                activity: {
                    label: "New reply",
                    tone: "completed",
                },
            }),
        ).toEqual({
            label: "New reply",
            tone: "completed",
        });
    });

    test("does not mark the open conversation as new", () => {
        expect(
            resolveConversationActivityState({
                isActiveConversation: true,
                activity: {
                    label: "New reply",
                    tone: "completed",
                },
            }),
        ).toBeNull();
    });
});

describe("getScopedChatTargetKey", () => {
    test("distinguishes chats with the same id under different agents", () => {
        expect(
            getScopedChatTargetKey({ id: "chat-1", agentId: "agent-a" }),
        ).not.toBe(
            getScopedChatTargetKey({ id: "chat-1", agentId: "agent-b" }),
        );
    });

    test("returns null for an absent chat target", () => {
        expect(getScopedChatTargetKey(null)).toBeNull();
    });
});
