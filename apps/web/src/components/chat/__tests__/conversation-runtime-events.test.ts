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
    test("recovers a started run with reconnect notice state", () => {
        expect(
            planConversationRunLifecycleResolution({
                resolution: {
                    type: "run.started",
                    activeRun: {
                        conversationId: "chat-1",
                        assistantMessageId: "assistant-1",
                        userContent: "hello",
                        content: "Recovered output",
                        runId: "run-1",
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
                conversationId: "chat-1",
                assistantMessageId: "assistant-1",
                userContent: "hello",
                content: "Recovered output",
                runId: "run-1",
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
                    activeRun: {
                        conversationId: "chat-1",
                        assistantMessageId: "assistant-1",
                        userContent: "hello",
                        content: "",
                        runId: "run-1",
                    },
                    recovered: false,
                    streamingMessage: null,
                },
                pendingReconnectNotice: true,
                pendingInterruptError: reconnectError,
            }),
        ).toEqual({
            type: "run.started",
            activeRun: {
                conversationId: "chat-1",
                assistantMessageId: "assistant-1",
                userContent: "hello",
                content: "",
                runId: "run-1",
            },
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
                conversationId: "chat-1",
                assistantMessageId: "assistant-1",
                userContent: "hello",
                content: "Partial output",
                runId: "run-1",
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
                conversationId: "chat-1",
                assistantMessageId: "assistant-1",
                userContent: "hello",
                content: "Partial output",
                runId: "run-1",
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
