import { describe, expect, test } from "bun:test";
import type { ConversationRuntimeState } from "@/lib/types";
import type { RuntimeSyncResolution } from "../conversation-runtime-controller";
import { planConversationRuntimeSync } from "../conversation-runtime-hook";

function createRuntimeState(
    overrides: Partial<ConversationRuntimeState> = {},
): ConversationRuntimeState {
    return {
        phase: "idle",
        runId: null,
        assistantMessageId: null,
        provider: null,
        errorMessage: null,
        startedAt: null,
        completedAt: null,
        lastEventAt: null,
        ...overrides,
    };
}

function createSyncResolution(
    overrides: Partial<RuntimeSyncResolution> = {},
): RuntimeSyncResolution {
    return {
        shouldReset: false,
        recoveredRun: null,
        ...overrides,
    };
}

describe("conversation runtime hook planning", () => {
    test("retains the reconnect notice during the post-reset grace pass", () => {
        expect(
            planConversationRuntimeSync({
                syncResolution: createSyncResolution({
                    shouldReset: true,
                }),
                runtimeState: createRuntimeState({
                    phase: "idle",
                }),
                pendingReconnectNotice: true,
            }),
        ).toEqual({
            shouldReset: true,
            recoveredRun: null,
            recoveredRunNotice: null,
            clearPendingReconnectNotice: false,
        });
    });

    test("consumes the reconnect notice when a recovered run is available", () => {
        expect(
            planConversationRuntimeSync({
                syncResolution: createSyncResolution({
                    recoveredRun: {
                        conversationId: "chat-1",
                        assistantMessageId: "assistant-1",
                        userContent: "hello",
                        content: "Recovered output",
                        runId: "run-1",
                    },
                }),
                runtimeState: createRuntimeState({
                    phase: "recovering",
                    runId: "run-1",
                    assistantMessageId: "assistant-1",
                }),
                pendingReconnectNotice: true,
            }),
        ).toEqual({
            shouldReset: false,
            recoveredRun: {
                conversationId: "chat-1",
                assistantMessageId: "assistant-1",
                userContent: "hello",
                content: "Recovered output",
                runId: "run-1",
            },
            recoveredRunNotice: true,
            clearPendingReconnectNotice: true,
        });
    });

    test("does not synthesize a reconnect notice when none is pending", () => {
        expect(
            planConversationRuntimeSync({
                syncResolution: createSyncResolution({
                    recoveredRun: {
                        conversationId: "chat-1",
                        assistantMessageId: "assistant-1",
                        userContent: "hello",
                        content: "Recovered output",
                        runId: "run-1",
                    },
                }),
                runtimeState: createRuntimeState({
                    phase: "recovering",
                    runId: "run-1",
                    assistantMessageId: "assistant-1",
                }),
                pendingReconnectNotice: false,
            }),
        ).toEqual({
            shouldReset: false,
            recoveredRun: {
                conversationId: "chat-1",
                assistantMessageId: "assistant-1",
                userContent: "hello",
                content: "Recovered output",
                runId: "run-1",
            },
            recoveredRunNotice: false,
            clearPendingReconnectNotice: true,
        });
    });
});
