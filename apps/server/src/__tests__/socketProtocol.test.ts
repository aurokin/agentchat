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
                        thinking: "medium",
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
        });
    });

    test("rejects invalid thinking levels", () => {
        expect(() =>
            parseClientCommand(
                JSON.stringify({
                    id: "cmd-1",
                    type: "conversation.send",
                    payload: {
                        conversationId: "chat-1",
                        agentId: "agent-1",
                        modelId: "gpt-5.3-codex",
                        thinking: "fast",
                        content: "Hello",
                        userMessageId: "user-1",
                        assistantMessageId: "assistant-1",
                        history: [],
                    },
                }),
            ),
        ).toThrow("Invalid thinking level");
    });

    test("parses interrupt commands", () => {
        expect(
            parseClientCommand(
                JSON.stringify({
                    id: "cmd-2",
                    type: "conversation.interrupt",
                    payload: {
                        conversationId: "chat-1",
                    },
                }),
            ),
        ).toEqual({
            id: "cmd-2",
            type: "conversation.interrupt",
            payload: {
                conversationId: "chat-1",
            },
        });
    });
});
