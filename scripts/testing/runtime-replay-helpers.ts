import type { AgentchatSocketEvent } from "../../packages/shared/src/core/agentchat-socket";

export type PersistedRunEvent = {
    sequence: number;
    kind:
        | "run_started"
        | "message_delta"
        | "message_completed"
        | "run_completed"
        | "run_interrupted"
        | "run_failed"
        | "approval_requested"
        | "approval_resolved"
        | "user_input_requested"
        | "user_input_resolved"
        | "provider_status";
    textDelta: string | null;
    errorMessage: string | null;
    messageLocalId: string | null;
    createdAt: number;
};

export type RuntimeReplayIssue = {
    code: string;
    message: string;
    severity: "error" | "warning";
};

export type PersistedRunTimelineAnalysis = {
    ok: boolean;
    terminalStatus: "completed" | "interrupted" | "failed" | "pending";
    issues: RuntimeReplayIssue[];
};

export type SocketReplayAnalysis = {
    ok: boolean;
    terminalStatus: "completed" | "interrupted" | "failed" | "active";
    messageIds: string[];
    issues: RuntimeReplayIssue[];
};

function buildIssue(
    code: string,
    message: string,
    severity: RuntimeReplayIssue["severity"] = "error",
): RuntimeReplayIssue {
    return {
        code,
        message,
        severity,
    };
}

function sequencesAreStrictlyAscending(events: PersistedRunEvent[]): boolean {
    for (let index = 1; index < events.length; index += 1) {
        const previous = events[index - 1];
        const current = events[index];
        if (!previous || !current || current.sequence <= previous.sequence) {
            return false;
        }
    }

    return true;
}

export function analyzePersistedRunTimeline(params: {
    events: PersistedRunEvent[];
    initialAssistantMessageId: string;
    finalAssistantMessageId: string;
    finalStatus: "completed" | "interrupted" | "failed";
    finalContent: string;
    sawDelta: boolean;
    allowPendingTerminal?: boolean;
}): PersistedRunTimelineAnalysis {
    const issues: RuntimeReplayIssue[] = [];

    if (params.events.length < 3) {
        issues.push(
            buildIssue(
                "persisted_run_events_too_short",
                "Expected at least three persisted run events.",
            ),
        );
    }

    const sequences = params.events.map((event) => event.sequence);
    const uniqueSequences = new Set(sequences);
    if (uniqueSequences.size !== sequences.length) {
        issues.push(
            buildIssue(
                "persisted_run_events_duplicate_sequence",
                "Expected persisted run event sequences to be unique.",
            ),
        );
    }

    if (!sequencesAreStrictlyAscending(params.events)) {
        issues.push(
            buildIssue(
                "persisted_run_events_out_of_order",
                "Expected persisted run events to be stored in ascending sequence order.",
            ),
        );
    }

    const firstEvent = params.events[0];
    if (!firstEvent || firstEvent.kind !== "run_started") {
        issues.push(
            buildIssue(
                "persisted_run_events_missing_run_started",
                "Expected the first persisted run event to be run_started.",
            ),
        );
    } else if (firstEvent.messageLocalId !== params.initialAssistantMessageId) {
        issues.push(
            buildIssue(
                "persisted_run_events_initial_message_mismatch",
                "Expected run_started to point at the initial assistant message.",
            ),
        );
    }

    const terminalEvents = params.events.filter(
        (event) =>
            event.kind === "run_completed" ||
            event.kind === "run_interrupted" ||
            event.kind === "run_failed",
    );
    if (terminalEvents.length > 1) {
        issues.push(
            buildIssue(
                "persisted_run_events_multiple_terminal_events",
                "Expected at most one terminal run event.",
            ),
        );
    }

    const terminalEvent = terminalEvents[0] ?? null;
    let terminalStatus: PersistedRunTimelineAnalysis["terminalStatus"] =
        "pending";
    if (!terminalEvent) {
        if (!params.allowPendingTerminal) {
            issues.push(
                buildIssue(
                    "persisted_run_events_missing_terminal",
                    "Expected a terminal persisted run event.",
                ),
            );
        }
    } else {
        terminalStatus =
            terminalEvent.kind === "run_completed"
                ? "completed"
                : terminalEvent.kind === "run_interrupted"
                  ? "interrupted"
                  : "failed";

        const lastEvent = params.events.at(-1);
        if (lastEvent?.sequence !== terminalEvent.sequence) {
            issues.push(
                buildIssue(
                    "persisted_run_events_terminal_not_last",
                    "Expected the terminal run event to be the final persisted event.",
                ),
            );
        }
    }

    if (terminalStatus !== "pending" && terminalStatus !== params.finalStatus) {
        issues.push(
            buildIssue(
                "persisted_run_events_terminal_status_mismatch",
                `Expected terminal run event ${params.finalStatus}, got ${terminalStatus}.`,
            ),
        );
    }

    if (terminalStatus === "completed" || terminalStatus === "interrupted") {
        const secondToLastEvent = params.events.at(-2);
        if (
            !secondToLastEvent ||
            secondToLastEvent.kind !== "message_completed"
        ) {
            issues.push(
                buildIssue(
                    "persisted_run_events_missing_message_completed",
                    "Expected message_completed immediately before the terminal run event.",
                ),
            );
        }
    }

    const deltaEvents = params.events.filter(
        (event) =>
            event.kind === "message_delta" &&
            event.messageLocalId === params.finalAssistantMessageId,
    );
    if (params.sawDelta) {
        if (deltaEvents.length > 0) {
            const reconstructedContent = deltaEvents
                .map((event) => event.textDelta ?? "")
                .join("");
            if (!params.finalContent.startsWith(reconstructedContent)) {
                issues.push(
                    buildIssue(
                        "persisted_run_events_delta_prefix_mismatch",
                        "Expected persisted deltas to remain a prefix of the final assistant content.",
                    ),
                );
            }
        } else if (params.finalContent.length === 0) {
            issues.push(
                buildIssue(
                    "persisted_run_events_missing_streamed_content",
                    "Expected streamed runs without persisted deltas to still finish with assistant content.",
                ),
            );
        }
    }

    if (
        !params.sawDelta &&
        deltaEvents.length > 0 &&
        params.finalContent.length === 0
    ) {
        issues.push(
            buildIssue(
                "persisted_run_events_phantom_delta_content",
                "Expected empty-delta runs to avoid phantom persisted content.",
            ),
        );
    }

    return {
        ok: issues.length === 0,
        terminalStatus,
        issues,
    };
}

export function assertPersistedRunTimeline(params: {
    events: PersistedRunEvent[];
    initialAssistantMessageId: string;
    finalAssistantMessageId: string;
    finalStatus: "completed" | "interrupted" | "failed";
    finalContent: string;
    sawDelta: boolean;
    allowPendingTerminal?: boolean;
}): void {
    const analysis = analyzePersistedRunTimeline(params);
    if (analysis.ok) {
        return;
    }

    throw new Error(analysis.issues.map((issue) => issue.message).join(" | "));
}

export function analyzeSocketReplay(params: {
    events: AgentchatSocketEvent[];
    allowActiveReplay?: boolean;
}): SocketReplayAnalysis {
    const issues: RuntimeReplayIssue[] = [];
    const messageContents = new Map<string, string>();
    const messageKinds = new Map<string, "assistant_message" | "assistant_status">();
    const messageIds: string[] = [];
    let runStartedCount = 0;
    let terminalStatus: SocketReplayAnalysis["terminalStatus"] = "active";
    let terminalIndex = -1;
    let highestMessageIndex = -1;

    for (const [index, event] of params.events.entries()) {
        if (event.type === "run.started") {
            runStartedCount += 1;
            if (index !== 0) {
                issues.push(
                    buildIssue(
                        "socket_replay_run_started_not_first",
                        "Expected run.started to be the first replayed event.",
                    ),
                );
            }
        }

        if (event.type === "message.started") {
            if (runStartedCount === 0) {
                issues.push(
                    buildIssue(
                        "socket_replay_missing_run_started",
                        "Expected run.started before message.started.",
                    ),
                );
            }
            if (event.payload.messageIndex !== highestMessageIndex + 1) {
                issues.push(
                    buildIssue(
                        "socket_replay_message_index_gap",
                        "Expected replayed message.started events to use contiguous message indexes.",
                    ),
                );
            }
            highestMessageIndex = event.payload.messageIndex;
            const previousMessageId = messageIds.at(-1) ?? null;
            const previousKind =
                previousMessageId !== null
                    ? (messageKinds.get(previousMessageId) ?? null)
                    : null;
            if (event.payload.messageIndex > 0) {
                if (!event.payload.previousMessageId || !event.payload.previousKind) {
                    issues.push(
                        buildIssue(
                            "socket_replay_missing_previous_message_link",
                            "Expected replayed multi-message transitions to include previousMessageId and previousKind.",
                        ),
                    );
                } else {
                    if (event.payload.previousMessageId !== previousMessageId) {
                        issues.push(
                            buildIssue(
                                "socket_replay_previous_message_mismatch",
                                "Expected previousMessageId to point at the immediately prior replayed assistant message.",
                            ),
                        );
                    }
                    if (event.payload.previousKind !== previousKind) {
                        issues.push(
                            buildIssue(
                                "socket_replay_previous_kind_mismatch",
                                "Expected previousKind to match the immediately prior replayed assistant message kind.",
                            ),
                        );
                    }
                }
            }
            messageIds.push(event.payload.messageId);
            messageKinds.set(event.payload.messageId, event.payload.kind);
            messageContents.set(event.payload.messageId, event.payload.content);
        }

        if (event.type === "message.delta") {
            const existingContent = messageContents.get(
                event.payload.messageId,
            );
            if (existingContent === undefined) {
                issues.push(
                    buildIssue(
                        "socket_replay_delta_before_message_started",
                        "Expected message.delta to follow message.started for the same message.",
                    ),
                );
            } else {
                const expectedContent = existingContent + event.payload.delta;
                if (event.payload.content !== expectedContent) {
                    issues.push(
                        buildIssue(
                            "socket_replay_delta_content_mismatch",
                            "Expected replayed message.delta content to equal the prior content plus delta.",
                        ),
                    );
                }
                messageContents.set(
                    event.payload.messageId,
                    event.payload.content,
                );
            }
        }

        if (event.type === "message.completed") {
            const existingContent = messageContents.get(
                event.payload.messageId,
            );
            if (existingContent === undefined) {
                issues.push(
                    buildIssue(
                        "socket_replay_completed_before_message_started",
                        "Expected message.completed to follow message.started for the same message.",
                    ),
                );
            } else if (!event.payload.content.startsWith(existingContent)) {
                issues.push(
                    buildIssue(
                        "socket_replay_completed_content_mismatch",
                        "Expected replayed message.completed content to preserve prior streamed content.",
                    ),
                );
            }
            messageContents.set(event.payload.messageId, event.payload.content);
        }

        if (
            event.type === "run.completed" ||
            event.type === "run.interrupted" ||
            event.type === "run.failed"
        ) {
            if (terminalIndex >= 0) {
                issues.push(
                    buildIssue(
                        "socket_replay_multiple_terminal_events",
                        "Expected at most one terminal replay event.",
                    ),
                );
            }
            terminalIndex = index;
            terminalStatus =
                event.type === "run.completed"
                    ? "completed"
                    : event.type === "run.interrupted"
                      ? "interrupted"
                      : "failed";
        }
    }

    if (runStartedCount === 0) {
        issues.push(
            buildIssue(
                "socket_replay_missing_run_started",
                "Expected replayed events to include run.started.",
            ),
        );
    }
    if (runStartedCount > 1) {
        issues.push(
            buildIssue(
                "socket_replay_multiple_run_started",
                "Expected at most one run.started replay event.",
            ),
        );
    }

    if (terminalIndex >= 0 && terminalIndex !== params.events.length - 1) {
        issues.push(
            buildIssue(
                "socket_replay_terminal_not_last",
                "Expected the terminal replay event to be last.",
            ),
        );
    }

    if (terminalIndex < 0 && !params.allowActiveReplay) {
        issues.push(
            buildIssue(
                "socket_replay_missing_terminal",
                "Expected replayed events to include a terminal run event.",
            ),
        );
    }

    return {
        ok: issues.length === 0,
        terminalStatus,
        messageIds,
        issues,
    };
}
