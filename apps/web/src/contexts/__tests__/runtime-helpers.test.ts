import { describe, expect, test } from "bun:test";

import { deriveConversationRuntimeState } from "@/contexts/runtime-helpers";
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

describe("deriveConversationRuntimeState", () => {
    test("returns active for running persisted runs", () => {
        expect(
            deriveConversationRuntimeState({
                messages: [],
                runSummaries: [createRunSummary()],
            }),
        ).toEqual({
            phase: "active",
            runId: "run-1",
            assistantMessageId: "message-1",
            provider: "codex-default",
            errorMessage: null,
            startedAt: 1,
            completedAt: null,
            lastEventAt: 2,
        });
    });

    test("returns failed for errored persisted runs", () => {
        expect(
            deriveConversationRuntimeState({
                messages: [],
                runSummaries: [
                    createRunSummary({
                        status: "errored",
                        errorMessage: "Codex crashed",
                        completedAt: 3,
                    }),
                ],
            }),
        ).toEqual({
            phase: "failed",
            runId: "run-1",
            assistantMessageId: "message-1",
            provider: "codex-default",
            errorMessage: "Codex crashed",
            startedAt: 1,
            completedAt: 3,
            lastEventAt: 2,
        });
    });

    test("falls back to streaming messages when run summaries are not loaded yet", () => {
        expect(
            deriveConversationRuntimeState({
                messages: [
                    createMessage({
                        status: "streaming",
                        runId: "run-streaming",
                        updatedAt: 5,
                    }),
                ],
                runSummaries: [],
            }),
        ).toEqual({
            phase: "active",
            runId: "run-streaming",
            assistantMessageId: "message-1",
            provider: null,
            errorMessage: null,
            startedAt: 1,
            completedAt: null,
            lastEventAt: 5,
        });
    });

    test("returns idle when nothing is running", () => {
        expect(
            deriveConversationRuntimeState({
                messages: [],
                runSummaries: [
                    createRunSummary({
                        status: "completed",
                        completedAt: 3,
                    }),
                ],
            }),
        ).toEqual({
            phase: "idle",
            runId: null,
            assistantMessageId: null,
            provider: null,
            errorMessage: null,
            startedAt: null,
            completedAt: null,
            lastEventAt: null,
        });
    });
});
