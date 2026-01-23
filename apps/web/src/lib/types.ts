import type { Skill } from "@shared/core/skills";

export interface Message {
    id: string;
    sessionId: string;
    role: "user" | "assistant" | "system";
    content: string; // What the user typed (displayed in UI)
    contextContent: string; // What is sent to API (includes skill prompt if applicable)
    thinking?: string;
    skill?: Skill | null; // Cloned skill object (not just ID reference)
    // Settings snapshot when message was created
    modelId?: string;
    thinkingLevel?: ThinkingLevel;
    searchLevel?: SearchLevel;
    attachmentIds?: string[]; // References to attachments store
    createdAt: number;
}

export type ThinkingLevel =
    | "xhigh"
    | "high"
    | "medium"
    | "low"
    | "minimal"
    | "none";

export type SearchLevel = "none" | "low" | "medium" | "high";

export interface ChatSession {
    id: string;
    title: string;
    modelId: string;
    thinking: ThinkingLevel;
    searchLevel: SearchLevel;
    createdAt: number;
    updatedAt: number;
}

export interface UserSettings {
    apiKey: string | null;
    defaultModel: string;
    defaultThinking: ThinkingLevel;
    defaultSearchLevel: SearchLevel;
    theme: "light" | "dark" | "system";
    favoriteModels: string[];
}

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

export type {
    Skill,
    SkillSettings,
    SkillSettingsUpdate,
} from "@shared/core/skills";

// Image attachment types
export type ImageMimeType =
    | "image/jpeg"
    | "image/png"
    | "image/gif"
    | "image/webp";

export interface Attachment {
    id: string;
    messageId: string;
    type: "image";
    mimeType: ImageMimeType;
    data: string; // base64-encoded image data (without data URL prefix)
    width: number;
    height: number;
    size: number; // bytes
    createdAt: number;
    purgedAt?: number; // timestamp when image was purged to save storage
}

export interface PendingAttachment {
    id: string;
    type: "image";
    mimeType: string;
    data: string; // base64-encoded image data (without data URL prefix)
    width: number;
    height: number;
    size: number; // bytes
    preview: string; // data URL for thumbnail preview
}
