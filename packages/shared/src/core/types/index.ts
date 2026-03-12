export type ThinkingLevel =
    | "xhigh"
    | "high"
    | "medium"
    | "low"
    | "minimal"
    | "none";

export interface Message {
    id: string;
    sessionId: string;
    role: "user" | "assistant" | "system";
    content: string;
    contextContent: string;
    status?: "draft" | "streaming" | "completed" | "interrupted" | "errored";
    thinking?: string;
    runId?: string | null;
    modelId?: string;
    thinkingLevel?: ThinkingLevel;
    attachmentIds?: string[];
    createdAt: number;
    updatedAt?: number;
    completedAt?: number | null;
}

export interface ChatSession {
    id: string;
    agentId: string;
    title: string;
    modelId: string;
    thinking: ThinkingLevel;
    settingsLockedAt?: number | null;
    createdAt: number;
    updatedAt: number;
}

export interface UserSettings {
    defaultModel: string;
    defaultThinking: ThinkingLevel;
    theme: "light" | "dark" | "system";
    favoriteModels: string[];
}

export interface Attachment {
    id: string;
    messageId: string;
    type: "image";
    mimeType: string;
    data: string;
    width: number;
    height: number;
    size: number;
    createdAt: number;
    purgedAt?: number;
}

export interface PendingAttachment {
    id: string;
    type: "image";
    mimeType: string;
    data: string;
    width: number;
    height: number;
    size: number;
    preview: string;
}
