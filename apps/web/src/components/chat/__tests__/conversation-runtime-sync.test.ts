import { describe, expect, test } from "bun:test";
import type { ConversationRuntimeState } from "@/lib/types";
import type { RuntimeSyncResolution } from "../conversation-runtime-controller";
import { shouldClearPendingReconnectNoticeAfterSync } from "../conversation-runtime-sync";

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

const recoveredRun = {
    conversationId: "chat-1",
    agentId: "agent-1",
    assistantMessageId: "assistant-1",
    userContent: "hello",
    content: "Recovered output",
    runId: "run-1",
} as const;

describe("conversation runtime sync", () => {
    test("keeps the pending reconnect notice for one grace pass after a local reset", () => {
        expect(
            shouldClearPendingReconnectNoticeAfterSync({
                syncResolution: createSyncResolution({
                    shouldReset: true,
                    recoveredRun: null,
                }),
                runtimeState: createRuntimeState({
                    phase: "idle",
                }),
            }),
        ).toBe(false);
    });

    test("clears the pending reconnect notice once a recovered run is applied", () => {
        expect(
            shouldClearPendingReconnectNoticeAfterSync({
                syncResolution: createSyncResolution({
                    recoveredRun,
                }),
                runtimeState: createRuntimeState({
                    phase: "recovering",
                    runId: "run-1",
                    assistantMessageId: "assistant-1",
                }),
            }),
        ).toBe(true);
    });

    test("clears the pending reconnect notice when the runtime remains terminal without a reset", () => {
        expect(
            shouldClearPendingReconnectNoticeAfterSync({
                syncResolution: createSyncResolution(),
                runtimeState: createRuntimeState({
                    phase: "interrupted",
                }),
            }),
        ).toBe(true);
    });
});
