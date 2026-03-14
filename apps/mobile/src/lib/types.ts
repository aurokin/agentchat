export interface ChatRunSummary {
    externalId: string;
    provider: string;
    status:
        | "queued"
        | "starting"
        | "running"
        | "completed"
        | "interrupted"
        | "errored";
    errorMessage: string | null;
    startedAt: number;
    completedAt: number | null;
    outputMessageLocalId: string | null;
    latestEventKind:
        | "run_started"
        | "message_started"
        | "message_delta"
        | "message_completed"
        | "run_completed"
        | "run_interrupted"
        | "run_failed"
        | "approval_requested"
        | "approval_resolved"
        | "user_input_requested"
        | "user_input_resolved"
        | "provider_status"
        | null;
    latestEventAt: number | null;
}

export type ConversationRuntimePhase =
    | "idle"
    | "active"
    | "recovering"
    | "interrupted"
    | "failed";

export interface ConversationRuntimeState {
    phase: ConversationRuntimePhase;
    runId: string | null;
    assistantMessageId: string | null;
    provider: string | null;
    errorMessage: string | null;
    startedAt: number | null;
    completedAt: number | null;
    lastEventAt: number | null;
}
