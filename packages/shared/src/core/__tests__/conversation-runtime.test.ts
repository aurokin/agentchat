import { describe, expect, test } from "bun:test";
import {
    isConversationRuntimeSnapshotLive,
    shouldClearPendingReconnectNoticeAfterRuntimeSync,
    synchronizeActiveRunWithRuntimeSnapshot,
    shouldResetActiveRunForRuntimeSnapshot,
    type ActiveRunState,
    type ConversationRuntimeSnapshot,
} from "../conversation-runtime";

function createRuntimeState(
    overrides: Partial<ConversationRuntimeSnapshot> = {},
): ConversationRuntimeSnapshot {
    return {
        phase: "idle",
        runId: null,
        assistantMessageId: null,
        ...overrides,
    };
}

function createActiveRun(
    overrides: Partial<ActiveRunState> = {},
): ActiveRunState {
    return {
        conversationId: "chat-1",
        assistantMessageId: "assistant-1",
        userContent: "Hello",
        content: "Partial output",
        runId: "run-1",
        ...overrides,
    };
}

describe("conversation runtime helpers", () => {
    test("treats recovering snapshots as live runtime state", () => {
        expect(
            isConversationRuntimeSnapshotLive(
                createRuntimeState({ phase: "recovering" }),
            ),
        ).toBe(true);
        expect(
            isConversationRuntimeSnapshotLive(
                createRuntimeState({ phase: "active" }),
            ),
        ).toBe(true);
        expect(
            isConversationRuntimeSnapshotLive(
                createRuntimeState({ phase: "failed" }),
            ),
        ).toBe(false);
    });

    test("resets a local active run when the authoritative assistant message changes", () => {
        expect(
            shouldResetActiveRunForRuntimeSnapshot({
                currentConversationId: "chat-1",
                runtimeState: createRuntimeState({
                    phase: "active",
                    runId: "run-2",
                    assistantMessageId: "assistant-2",
                }),
                activeRun: createActiveRun(),
            }),
        ).toBe(true);
    });

    test("keeps the local active run when the snapshot still describes the same run", () => {
        expect(
            shouldResetActiveRunForRuntimeSnapshot({
                currentConversationId: "chat-1",
                runtimeState: createRuntimeState({
                    phase: "recovering",
                    runId: "run-1",
                    assistantMessageId: "assistant-1",
                }),
                activeRun: createActiveRun(),
            }),
        ).toBe(false);
    });

    test("hydrates a missing local run id from the authoritative runtime snapshot", () => {
        expect(
            synchronizeActiveRunWithRuntimeSnapshot({
                currentConversationId: "chat-1",
                runtimeState: createRuntimeState({
                    phase: "active",
                    runId: "run-1",
                    assistantMessageId: "assistant-1",
                }),
                activeRun: createActiveRun({ runId: null }),
            }),
        ).toEqual(createActiveRun());
    });

    test("keeps reconnect notices through a post-reset grace pass", () => {
        expect(
            shouldClearPendingReconnectNoticeAfterRuntimeSync({
                shouldReset: true,
                recoveredRun: null,
                runtimeState: createRuntimeState({ phase: "idle" }),
            }),
        ).toBe(false);

        expect(
            shouldClearPendingReconnectNoticeAfterRuntimeSync({
                shouldReset: false,
                recoveredRun: createActiveRun(),
                runtimeState: createRuntimeState({ phase: "recovering" }),
            }),
        ).toBe(true);
    });
});
