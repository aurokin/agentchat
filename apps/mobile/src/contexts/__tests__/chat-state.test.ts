import { describe, expect, test } from "bun:test";

import {
    buildConversationRuntimeBindingMap,
    getScopedChatStateKey,
} from "../chat-state";
import type { ConversationRuntimeBindingSummary } from "@/lib/types";

describe("chat state helpers", () => {
    test("keys chat state by both agent and chat id", () => {
        expect(getScopedChatStateKey("chat-1", "agent-a")).not.toBe(
            getScopedChatStateKey("chat-1", "agent-b"),
        );
    });

    test("keeps runtime bindings for duplicate local ids under different agents", () => {
        const bindings = [
            {
                agentId: "agent-a",
                conversationId: "chat-1",
                activity: { label: "Working", tone: "working" },
            },
            {
                agentId: "agent-b",
                conversationId: "chat-1",
                activity: { label: "Needs attention", tone: "errored" },
            },
        ] as ConversationRuntimeBindingSummary[];

        const keyed = buildConversationRuntimeBindingMap(bindings);

        expect(
            keyed[getScopedChatStateKey("chat-1", "agent-a")]?.activity,
        ).toEqual({ label: "Working", tone: "working" });
        expect(
            keyed[getScopedChatStateKey("chat-1", "agent-b")]?.activity,
        ).toEqual({ label: "Needs attention", tone: "errored" });
    });
});
