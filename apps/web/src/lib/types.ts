import type {
    Skill,
    SkillSettings as SharedSkillSettings,
    SkillSettingsUpdate as SharedSkillSettingsUpdate,
} from "@shared/core/skills";
import type {
    Message as SharedMessage,
    ChatSession as SharedChatSession,
    UserSettings as SharedUserSettings,
    Attachment as SharedAttachment,
    PendingAttachment as SharedPendingAttachment,
    ThinkingLevel as SharedThinkingLevel,
    SearchLevel as SharedSearchLevel,
} from "@shared/core/types";

export type { Skill };

export type { SharedSkillSettings as SkillSettings };
export type { SharedSkillSettingsUpdate as SkillSettingsUpdate };

export type ThinkingLevel = SharedThinkingLevel;

export type SearchLevel = SharedSearchLevel;

export interface Message extends SharedMessage {
    contextContent: string;
}

export interface ChatSession extends SharedChatSession {}

export interface UserSettings extends SharedUserSettings {}

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
    provider: string;
    supportedParameters?: SupportedParameter[];
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
