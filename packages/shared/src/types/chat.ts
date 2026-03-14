export interface Message {
    id: string;
    sessionId: string;
    role: "user" | "assistant" | "system";
    content: string;
    reasoning?: string;
    createdAt: number;
}

export interface ChatSession {
    id: string;
    agentId: string;
    title: string;
    modelId: string;
    reasoningEnabled: boolean;
    createdAt: number;
    updatedAt: number;
}
