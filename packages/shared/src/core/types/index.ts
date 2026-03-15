export type ReasoningEffort =
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
    kind?: "user" | "assistant_message" | "assistant_status" | "system";
    content: string;
    contextContent: string;
    status?: "draft" | "streaming" | "completed" | "interrupted" | "errored";
    reasoning?: string;
    runId?: string | null;
    runMessageIndex?: number | null;
    modelId?: string;
    variantId?: string | null;
    reasoningEffort?: ReasoningEffort;
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
    lastViewedAt?: number | null;
    createdAt: number;
    updatedAt: number;
}

export interface UserSettings {
    defaultModel: string;
    theme: "light" | "dark" | "system";
    favoriteModels: string[];
}
