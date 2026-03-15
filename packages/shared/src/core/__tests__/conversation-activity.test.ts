import { describe, expect, test } from "bun:test";

import { resolveConversationActivityState } from "../conversation-activity";

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
