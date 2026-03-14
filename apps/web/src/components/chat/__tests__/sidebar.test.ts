import { describe, expect, test } from "bun:test";

import { resolveSidebarConversationState } from "@/components/chat/Sidebar";

describe("resolveSidebarConversationState", () => {
    test("marks active runs as working", () => {
        expect(
            resolveSidebarConversationState({
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
            resolveSidebarConversationState({
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
            resolveSidebarConversationState({
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
