import { describe, expect, test } from "bun:test";
import {
    isConversationRuntimeSnapshotLive,
    resolveConversationSocketEvent,
    shouldApplyConversationScopedUpdate,
    shouldClearPendingReconnectNoticeAfterRuntimeSync,
    shouldResetPendingConversationSendOnConversationChange,
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
        agentId: "agent-a",
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
                currentAgentId: "agent-a",
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
                currentAgentId: "agent-a",
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
                currentAgentId: "agent-a",
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

    test("resets a local active run when the user switches to the same chat id on another agent", () => {
        expect(
            shouldResetActiveRunForRuntimeSnapshot({
                currentConversationId: "chat-1",
                currentAgentId: "agent-b",
                runtimeState: createRuntimeState({
                    phase: "active",
                    runId: "run-1",
                    assistantMessageId: "assistant-1",
                }),
                activeRun: createActiveRun({ agentId: "agent-a" }),
            }),
        ).toBe(true);
    });

    test("applies conversation-scoped updates only for the current conversation", () => {
        expect(
            shouldApplyConversationScopedUpdate({
                currentConversationId: "chat-1",
                currentAgentId: "agent-a",
                targetConversationId: "chat-1",
                targetAgentId: "agent-a",
            }),
        ).toBe(true);

        expect(
            shouldApplyConversationScopedUpdate({
                currentConversationId: "chat-2",
                currentAgentId: "agent-a",
                targetConversationId: "chat-1",
                targetAgentId: "agent-a",
            }),
        ).toBe(false);

        expect(
            shouldApplyConversationScopedUpdate({
                currentConversationId: "chat-1",
                currentAgentId: "agent-b",
                targetConversationId: "chat-1",
                targetAgentId: "agent-a",
            }),
        ).toBe(false);
    });

    test("resets a pending send when the user switches away before the run is bound", () => {
        expect(
            shouldResetPendingConversationSendOnConversationChange({
                currentConversationId: "chat-2",
                currentAgentId: "agent-a",
                pendingSendConversationId: "chat-1",
                pendingSendAgentId: "agent-a",
                activeRun: null,
            }),
        ).toBe(true);

        expect(
            shouldResetPendingConversationSendOnConversationChange({
                currentConversationId: "chat-1",
                currentAgentId: "agent-a",
                pendingSendConversationId: "chat-1",
                pendingSendAgentId: "agent-a",
                activeRun: null,
            }),
        ).toBe(false);

        expect(
            shouldResetPendingConversationSendOnConversationChange({
                currentConversationId: "chat-2",
                currentAgentId: "agent-a",
                pendingSendConversationId: "chat-1",
                pendingSendAgentId: "agent-a",
                activeRun: createActiveRun(),
            }),
        ).toBe(false);

        expect(
            shouldResetPendingConversationSendOnConversationChange({
                currentConversationId: "chat-1",
                currentAgentId: "agent-b",
                pendingSendConversationId: "chat-1",
                pendingSendAgentId: "agent-a",
                activeRun: null,
            }),
        ).toBe(true);
    });
});
