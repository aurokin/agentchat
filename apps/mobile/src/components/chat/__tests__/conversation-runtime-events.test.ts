import { describe, expect, test } from "bun:test";
import type { AgentchatSocketEvent } from "@/lib/agentchat-socket";
import type { SocketEventResolution } from "@shared/core/conversation-runtime";
import {
    planMobileConnectionError,
    planMobileMessageLifecycleResolution,
    planMobileRunLifecycleResolution,
} from "../conversation-runtime-events";

describe("mobile conversation runtime events", () => {
    test("plans a recovered run.started with reconnect notice state", () => {
        expect(
            planMobileRunLifecycleResolution({
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
            shouldSetLoading: true,
            error: null,
            recoveredRunNotice: true,
            clearPendingReconnectNotice: true,
            streamingMessage: {
                id: "assistant-1",
                content: "Recovered output",
            },
        });
    });

    test("surfaces a flushed interrupt error on run.started", () => {
        expect(
            planMobileRunLifecycleResolution({
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
                pendingReconnectNotice: false,
                pendingInterruptError: {
                    message: "interrupt failed",
                    isRetryable: true,
                },
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
            shouldSetLoading: true,
            error: {
                message: "interrupt failed",
                isRetryable: true,
            },
            recoveredRunNotice: null,
            clearPendingReconnectNotice: false,
            streamingMessage: null,
        });
    });

    test("plans connection.error retry state only when a run is active", () => {
        const event: Extract<AgentchatSocketEvent, { type: "connection.error" }> =
            {
                type: "connection.error",
                payload: {
                    message: "socket closed",
                },
            };

        expect(
            planMobileConnectionError({
                activeRun: null,
                event,
            }),
        ).toEqual({ type: "ignore" });

        expect(
            planMobileConnectionError({
                activeRun: {
                    conversationId: "chat-1",
                    assistantMessageId: "assistant-1",
                    userContent: "hello",
                    content: "Partial output",
                    runId: "run-1",
                },
                event,
            }),
        ).toEqual({
            type: "connection.error",
            error: {
                message: "socket closed",
                isRetryable: true,
            },
            retryPayload: {
                content: "hello",
                contextContent: "hello",
            },
            shouldClearRuntimeState: true,
        });
    });

    test("plans message completion streaming updates only for the active assistant message", () => {
        const resolution: SocketEventResolution = {
            type: "message.completed",
            activeRun: {
                conversationId: "chat-1",
                assistantMessageId: "assistant-2",
                userContent: "hello",
                content: "second message",
                runId: "run-1",
            },
            messageId: "assistant-2",
            finalContent: "second message",
        };

        expect(planMobileMessageLifecycleResolution(resolution)).toEqual({
            type: "message.completed",
            activeRun: resolution.activeRun,
            messagePatch: {
                id: "assistant-2",
                content: "second message",
                contextContent: "second message",
                status: "completed",
            },
            streamingMessage: {
                id: "assistant-2",
                content: "second message",
            },
        });

        expect(
            planMobileMessageLifecycleResolution({
                ...resolution,
                messageId: "assistant-1",
            }),
        ).toEqual({
            type: "message.completed",
            activeRun: resolution.activeRun,
            messagePatch: {
                id: "assistant-1",
                content: "second message",
                contextContent: "second message",
                status: "completed",
            },
            streamingMessage: null,
        });
    });
});
