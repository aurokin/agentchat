import { describe, expect, test } from "bun:test";

import {
    buildConversationRuntimeBindingMap,
    getScopedChatStateKey,
    insertScopedMessage,
    patchScopedMessage,
    replaceScopedMessage,
} from "../chat-state";
import type { ConversationRuntimeBindingSummary } from "@/lib/types";
import type { Message } from "@shared/core/types";

describe("chat state helpers", () => {
    const createMessage = (
        overrides: Partial<Message> = {},
    ): Message => ({
        id: "message-1",
        sessionId: "chat-1",
        role: "assistant",
        content: "hello",
        contextContent: "hello",
        status: "draft",
        createdAt: 1,
        ...overrides,
    });

    test("keys chat state by both agent and chat id", () => {
        expect(getScopedChatStateKey("chat-1", "agent-a")).not.toBe(
            getScopedChatStateKey("chat-1", "agent-b"),
        );
    });

    test("keeps keys injective when ids contain separators", () => {
        expect(getScopedChatStateKey("chat:1", "agent:one")).not.toBe(
            getScopedChatStateKey("chat", "agent:one:1"),
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

    test("inserts messages into the explicitly scoped agent bucket", () => {
        const next = insertScopedMessage(
            {
                [getScopedChatStateKey("chat-1", "agent-a")]: [
                    createMessage({ id: "message-a" }),
                ],
                [getScopedChatStateKey("chat-1", "agent-b")]: [],
            },
            createMessage({ id: "message-b" }),
            "agent-b",
        );

        expect(next[getScopedChatStateKey("chat-1", "agent-a")]).toHaveLength(
            1,
        );
        expect(next[getScopedChatStateKey("chat-1", "agent-b")]).toEqual([
            createMessage({ id: "message-b" }),
        ]);
    });

    test("patches and replaces messages in the explicitly scoped agent bucket", () => {
        const initial = {
            [getScopedChatStateKey("chat-1", "agent-a")]: [
                createMessage({ id: "shared-id", content: "agent-a" }),
            ],
            [getScopedChatStateKey("chat-1", "agent-b")]: [
                createMessage({ id: "shared-id", content: "agent-b" }),
            ],
        };

        const patched = patchScopedMessage(initial, {
            id: "shared-id",
            chatId: "chat-1",
            agentId: "agent-b",
            updates: { content: "patched-b" },
        });
        const replaced = replaceScopedMessage(
            patched,
            createMessage({
                id: "shared-id",
                content: "replaced-b",
                contextContent: "replaced-b",
            }),
            "agent-b",
        );

        expect(
            replaced[getScopedChatStateKey("chat-1", "agent-a")][0]?.content,
        ).toBe("agent-a");
        expect(
            replaced[getScopedChatStateKey("chat-1", "agent-b")][0]?.content,
        ).toBe("replaced-b");
    });
});
