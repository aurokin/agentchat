import { describe, expect, test } from "bun:test";
import type {
    RuntimeErrorState,
    SocketEventResolution,
} from "../conversation-runtime-controller";
import { planConversationRunLifecycleResolution } from "../conversation-runtime-events";

const reconnectError: RuntimeErrorState = {
    message: "cannot interrupt",
    isRetryable: true,
};

describe("conversation runtime events", () => {
    const activeRun = {
        conversationId: "chat-1",
        agentId: "agent-1",
        assistantMessageId: "assistant-1",
        userContent: "hello",
        content: "",
        runId: "run-1",
    } as const;

    test("recovers a started run with reconnect notice state", () => {
        expect(
            planConversationRunLifecycleResolution({
                resolution: {
                    type: "run.started",
                    activeRun: {
                        ...activeRun,
                        assistantMessageId: "assistant-1",
                        userContent: "hello",
                        content: "Recovered output",
                    },
                    recovered: true,
                    streamingMessage: {
                        id: "assistant-1",
                        content: "Recovered output",
                    },
                },
                pendingReconnectNotice: true,
            }),
        ).toEqual({
            type: "run.started",
            activeRun: {
                ...activeRun,
                assistantMessageId: "assistant-1",
                userContent: "hello",
                content: "Recovered output",
            },
            clearPendingInterrupt: true,
            error: null,
            shouldSetSending: true,
            recoveredRunNotice: true,
            clearPendingReconnectNotice: true,
            streamingMessage: {
                id: "assistant-1",
                content: "Recovered output",
            },
        });
    });

    test("surfaces a flushed interrupt error on run.started without treating it as recovered", () => {
        expect(
            planConversationRunLifecycleResolution({
                resolution: {
                    type: "run.started",
                    activeRun,
                    recovered: false,
                    streamingMessage: null,
                },
                pendingReconnectNotice: true,
                pendingInterruptError: reconnectError,
            }),
        ).toEqual({
            type: "run.started",
            activeRun,
            clearPendingInterrupt: true,
            error: reconnectError,
            shouldSetSending: false,
            recoveredRunNotice: null,
            clearPendingReconnectNotice: false,
            streamingMessage: null,
        });
    });

    test("plans terminal failure cleanup with retry metadata", () => {
        const resolution: SocketEventResolution = {
            type: "run.failed",
            activeRun: {
                ...activeRun,
                assistantMessageId: "assistant-1",
                userContent: "hello",
                content: "Partial output",
            },
            finalContent: "Partial output",
            error: {
                message: "provider failed",
                isRetryable: true,
            },
            retryChat: {
                content: "hello",
                contextContent: "hello",
            },
        };

        expect(
            planConversationRunLifecycleResolution({
                resolution,
                pendingReconnectNotice: false,
            }),
        ).toEqual({
            type: "terminal",
            activeRun: {
                ...activeRun,
                assistantMessageId: "assistant-1",
                userContent: "hello",
                content: "Partial output",
            },
            clearPendingInterrupt: true,
            persistFinalContent: "Partial output",
            error: {
                message: "provider failed",
                isRetryable: true,
            },
            retryChat: {
                content: "hello",
                contextContent: "hello",
            },
        });
    });
});
