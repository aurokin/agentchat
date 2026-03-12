import { describe, expect, test } from "bun:test";

import { resolveMessageRunDisplayState } from "@/components/chat/MessageList";
import type { ChatRunSummary, Message } from "@/lib/types";

function createMessage(overrides: Partial<Message> = {}): Message {
    return {
        id: "message-1",
        sessionId: "chat-1",
        role: "assistant",
        content: "Hello",
        contextContent: "Hello",
        createdAt: 1,
        ...overrides,
    };
}

function createRunSummary(
    overrides: Partial<ChatRunSummary> = {},
): ChatRunSummary {
    return {
        externalId: "run-1",
        provider: "codex-default",
        status: "running",
        errorMessage: null,
        startedAt: 1,
        completedAt: null,
        outputMessageLocalId: "message-1",
        latestEventKind: "message_delta",
        latestEventAt: 2,
        ...overrides,
    };
}

describe("resolveMessageRunDisplayState", () => {
    test("marks streaming runs as live", () => {
        expect(
            resolveMessageRunDisplayState({
                message: createMessage({ status: "streaming" }),
                runSummary: createRunSummary(),
            }),
        ).toEqual({
            label: "Streaming",
            tone: "live",
            detail: null,
        });
    });

    test("marks interrupted runs with a warning tone", () => {
        expect(
            resolveMessageRunDisplayState({
                message: createMessage({ status: "interrupted" }),
                runSummary: createRunSummary({ status: "interrupted" }),
            }),
        ).toEqual({
            label: "Interrupted",
            tone: "warning",
            detail: null,
        });
    });

    test("surfaces persisted run errors", () => {
        expect(
            resolveMessageRunDisplayState({
                message: createMessage({ status: "errored" }),
                runSummary: createRunSummary({
                    status: "errored",
                    errorMessage: "Codex app-server exited unexpectedly",
                }),
            }),
        ).toEqual({
            label: "Failed",
            tone: "error",
            detail: "Codex app-server exited unexpectedly",
        });
    });
});
