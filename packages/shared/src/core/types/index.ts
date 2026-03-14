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
    variantId?: string | null;
    thinkingLevel?: ThinkingLevel;
    createdAt: number;
    updatedAt?: number;
    completedAt?: number | null;
}

export interface ChatSession {
    id: string;
    agentId: string;
    title: string;
    modelId: string;
    variantId?: string | null;
    settingsLockedAt?: number | null;
    createdAt: number;
    updatedAt: number;
}

export interface UserSettings {
    defaultModel: string;
    theme: "light" | "dark" | "system";
    favoriteModels: string[];
}
