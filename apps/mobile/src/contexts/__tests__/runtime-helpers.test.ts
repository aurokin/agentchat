import { describe, expect, test } from "bun:test";
import { deriveConversationRuntimeState } from "@/contexts/runtime-helpers";
import type { Message } from "@shared/core/types";
import type { ChatRunSummary } from "@/lib/types";

function createMessage(overrides: Partial<Message> = {}): Message {
    return {
        id: "message-1",
        sessionId: "chat-1",
        role: "assistant",
        content: "",
        contextContent: "",
        status: "streaming",
        runId: "run-1",
        createdAt: 100,
        updatedAt: 110,
        ...overrides,
    };
}

function createRunSummary(
    overrides: Partial<ChatRunSummary> = {},
): ChatRunSummary {
    return {
        externalId: "run-1",
        provider: "codex",
        status: "running",
        errorMessage: null,
        startedAt: 100,
        completedAt: null,
        outputMessageLocalId: "message-1",
        latestEventKind: "message_delta",
        latestEventAt: 110,
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
            provider: "codex",
            errorMessage: null,
            startedAt: 100,
            completedAt: null,
            lastEventAt: 110,
        });
    });

    test("returns failed for errored persisted runs", () => {
        expect(
            deriveConversationRuntimeState({
                messages: [],
                runSummaries: [
                    createRunSummary({
                        status: "errored",
                        errorMessage: "boom",
                        completedAt: 200,
                    }),
                ],
            }),
        ).toEqual({
            phase: "failed",
            runId: "run-1",
            assistantMessageId: "message-1",
            provider: "codex",
            errorMessage: "boom",
            startedAt: 100,
            completedAt: 200,
            lastEventAt: 110,
        });
    });

    test("falls back to streaming messages when runs are not loaded yet", () => {
        expect(
            deriveConversationRuntimeState({
                messages: [createMessage()],
                runSummaries: [],
            }),
        ).toEqual({
            phase: "active",
            runId: "run-1",
            assistantMessageId: "message-1",
            provider: null,
            errorMessage: null,
            startedAt: 100,
            completedAt: null,
            lastEventAt: 110,
        });
    });

    test("returns idle when nothing is running", () => {
        expect(
            deriveConversationRuntimeState({
                messages: [createMessage({ status: "completed", runId: null })],
                runSummaries: [],
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
