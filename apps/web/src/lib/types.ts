import type {
    Message as SharedMessage,
    ChatSession as SharedChatSession,
    UserSettings as SharedUserSettings,
    Attachment as SharedAttachment,
    PendingAttachment as SharedPendingAttachment,
    ThinkingLevel as SharedThinkingLevel,
} from "@shared/core/types";

export type ThinkingLevel = SharedThinkingLevel;

export interface Message extends SharedMessage {
    contextContent: string;
}

export interface ChatSession extends SharedChatSession {}

export interface UserSettings extends SharedUserSettings {}

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

export type ImageMimeType =
    | "image/jpeg"
    | "image/png"
    | "image/gif"
    | "image/webp";

export interface Attachment extends SharedAttachment {
    mimeType: string;
}

export interface PendingAttachment extends SharedPendingAttachment {}

export enum SupportedParameter {
    Tools = "tools",
    Reasoning = "reasoning",
    Vision = "vision",
}

export interface OpenRouterModel {
    id: string;
    name: string;
    providerId?: string;
    provider: string;
    supportedParameters?: SupportedParameter[];
    variants?: Array<{
        id: string;
        label: string;
    }>;
}

export function modelSupportsSearch(
    model: OpenRouterModel | undefined,
): boolean {
    return (
        model?.supportedParameters?.includes(SupportedParameter.Tools) ?? false
    );
}

export function modelSupportsReasoning(
    model: OpenRouterModel | undefined,
): boolean {
    return (
        model?.supportedParameters?.includes(SupportedParameter.Reasoning) ??
        false
    );
}

export function modelSupportsVision(
    model: OpenRouterModel | undefined,
): boolean {
    return (
        model?.supportedParameters?.includes(SupportedParameter.Vision) ?? false
    );
}
