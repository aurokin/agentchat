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
  searchEnabled: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface UserSettings {
  apiKey: string | null;
  defaultModel: string;
  theme: "light" | "dark" | "system";
}

export interface OpenRouterModel {
  id: string;
  name: string;
  provider: string;
  thinking?: boolean;
  search?: boolean;
}
