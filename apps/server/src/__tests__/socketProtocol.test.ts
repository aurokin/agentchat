import { describe, expect, test } from "bun:test";

import { parseClientCommand } from "../socketProtocol.ts";

describe("socket protocol parsing", () => {
    test("parses send commands", () => {
        expect(
            parseClientCommand(
                JSON.stringify({
                    id: "cmd-1",
                    type: "conversation.send",
                    payload: {
                        conversationId: "chat-1",
                        agentId: "agent-1",
                        modelId: "gpt-5.3-codex",
                        variantId: "medium",
                        content: "Hello",
                        userMessageId: "user-1",
                        assistantMessageId: "assistant-1",
                        history: [],
                    },
                }),
            ),
        ).toMatchObject({
            id: "cmd-1",
            type: "conversation.send",
            payload: {
                variantId: "medium",
            },
        });
    });

    test("rejects send commands with invalid payloads", () => {
        expect(() =>
            parseClientCommand(
                JSON.stringify({
                    id: "cmd-1",
                    type: "conversation.send",
                    payload: {
                        conversationId: "chat-1",
                        agentId: "agent-1",
                        modelId: "gpt-5.3-codex",
                        content: "Hello",
                        assistantMessageId: "assistant-1",
                        history: [],
                    },
                }),
            ),
        ).toThrow("Invalid send payload");
    });

    test("parses interrupt commands", () => {
        expect(
            parseClientCommand(
                JSON.stringify({
                    id: "cmd-2",
                    type: "conversation.interrupt",
                    payload: {
                        conversationId: "chat-1",
                        agentId: "agent-1",
                    },
                }),
            ),
        ).toEqual({
            id: "cmd-2",
            type: "conversation.interrupt",
            payload: {
                conversationId: "chat-1",
                agentId: "agent-1",
            },
        });
    });

    test("parses subscribe commands", () => {
        expect(
            parseClientCommand(
                JSON.stringify({
                    id: "cmd-3",
                    type: "conversation.subscribe",
                    payload: {
                        conversationId: "chat-1",
                        agentId: "agent-1",
                    },
                }),
            ),
        ).toEqual({
            id: "cmd-3",
            type: "conversation.subscribe",
            payload: {
                conversationId: "chat-1",
                agentId: "agent-1",
            },
        });
    });

    test("rejects send commands with invalid history entries", () => {
        expect(() =>
            parseClientCommand(
                JSON.stringify({
                    id: "cmd-4",
                    type: "conversation.send",
                    payload: {
                        conversationId: "chat-1",
                        agentId: "agent-1",
                        modelId: "gpt-5.3-codex",
                        content: "Hello",
                        userMessageId: "user-1",
                        assistantMessageId: "assistant-1",
                        history: [{ role: "tool", content: "bad" }],
                    },
                }),
            ),
        ).toThrow("Invalid send payload");
    });

    test("parses delete commands", () => {
        expect(
            parseClientCommand(
                JSON.stringify({
                    id: "cmd-6",
                    type: "conversation.delete",
                    payload: {
                        conversationId: "chat-1",
                        agentId: "agent-1",
                    },
                }),
            ),
        ).toEqual({
            id: "cmd-6",
            type: "conversation.delete",
            payload: {
                conversationId: "chat-1",
                agentId: "agent-1",
            },
        });
    });

    test("rejects delete commands with missing agentId", () => {
        expect(() =>
            parseClientCommand(
                JSON.stringify({
                    id: "cmd-7",
                    type: "conversation.delete",
                    payload: {
                        conversationId: "chat-1",
                    },
                }),
            ),
        ).toThrow("Invalid delete payload");
    });

    test("rejects unsupported command types", () => {
        expect(() =>
            parseClientCommand(
                JSON.stringify({
                    id: "cmd-5",
                    type: "conversation.retry",
                    payload: {},
                }),
            ),
        ).toThrow("Unsupported command type: conversation.retry");
    });
});
