export interface Message {
    id: string;
    sessionId: string;
    role: "user" | "assistant" | "system";
    content: string;
    thinking?: string;
    createdAt: number;
}

export interface ChatSession {
    id: string;
    title: string;
    modelId: string;
    thinkingEnabled: boolean;
    createdAt: number;
    updatedAt: number;
}
