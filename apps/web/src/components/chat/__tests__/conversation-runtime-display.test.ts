import { describe, expect, test } from "bun:test";
import type { ConversationRuntimeState } from "@/lib/types";
import { resolveDisplayedRuntimeState } from "../conversation-runtime-display";

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

describe("conversation runtime display", () => {
    test("shows a recovering state when reconnect notice is present for an active run", () => {
        expect(
            resolveDisplayedRuntimeState({
                runtimeState: createRuntimeState({
                    phase: "active",
                    runId: "run-1",
                    assistantMessageId: "assistant-1",
                }),
                recoveredRunNotice: true,
            }),
        ).toEqual(
            createRuntimeState({
                phase: "recovering",
                runId: "run-1",
                assistantMessageId: "assistant-1",
            }),
        );
    });

    test("preserves interrupted runtime state even when a reconnect notice exists", () => {
        expect(
            resolveDisplayedRuntimeState({
                runtimeState: createRuntimeState({
                    phase: "interrupted",
                }),
                recoveredRunNotice: true,
            }),
        ).toEqual(
            createRuntimeState({
                phase: "interrupted",
            }),
        );
    });

    test("preserves recovering runtime state without needing a reconnect notice", () => {
        expect(
            resolveDisplayedRuntimeState({
                runtimeState: createRuntimeState({
                    phase: "recovering",
                    runId: "run-1",
                    assistantMessageId: "assistant-1",
                }),
                recoveredRunNotice: false,
            }),
        ).toEqual(
            createRuntimeState({
                phase: "recovering",
                runId: "run-1",
                assistantMessageId: "assistant-1",
            }),
        );
    });
});
