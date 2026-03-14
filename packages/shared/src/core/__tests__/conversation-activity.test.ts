import { describe, expect, test } from "bun:test";

import { resolveConversationActivityState } from "../conversation-activity";

describe("resolveConversationActivityState", () => {
    test("marks active runs as working", () => {
        expect(
            resolveConversationActivityState({
                isActiveConversation: false,
                runtimeBinding: {
                    status: "active",
                    lastEventAt: 10,
                },
                lastViewedAt: 5,
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
                runtimeBinding: {
                    status: "idle",
                    lastEventAt: 20,
                },
                lastViewedAt: 10,
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
                runtimeBinding: {
                    status: "idle",
                    lastEventAt: 20,
                },
                lastViewedAt: 10,
            }),
        ).toBeNull();
    });
});
