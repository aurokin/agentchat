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
    thinking?: string;
    modelId?: string;
    thinkingLevel?: ThinkingLevel;
    attachmentIds?: string[];
    createdAt: number;
}

export interface ChatSession {
    id: string;
    agentId: string;
    title: string;
    modelId: string;
    thinking: ThinkingLevel;
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
