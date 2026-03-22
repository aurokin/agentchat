import { describe, expect, test } from "bun:test";
import type { ConversationRuntimeState } from "@/lib/types";
import type { MobileRuntimeSyncResolution } from "../conversation-runtime-controller";
import { planMobileConversationRuntimeSync } from "../conversation-runtime-sync";

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
    overrides: Partial<MobileRuntimeSyncResolution> = {},
): MobileRuntimeSyncResolution {
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

describe("mobile conversation runtime sync", () => {
    test("keeps the pending reconnect notice for one grace pass after a local reset", () => {
        expect(
            planMobileConversationRuntimeSync({
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

    test("consumes the pending reconnect notice when a recovered run is restored", () => {
        expect(
            planMobileConversationRuntimeSync({
                syncResolution: createSyncResolution({
                    recoveredRun,
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
            recoveredRun,
            recoveredRunNotice: true,
            clearPendingReconnectNotice: true,
        });
    });
});
