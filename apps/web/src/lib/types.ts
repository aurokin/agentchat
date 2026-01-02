export interface Message {
  id: string;
  sessionId: string;
  role: "user" | "assistant" | "system";
  content: string;
  thinking?: string;
  skillId?: string;
  createdAt: number;
}

export type ThinkingLevel = "xhigh" | "high" | "medium" | "low" | "minimal" | "none";

export interface ChatSession {
  id: string;
  title: string;
  modelId: string;
  thinking: ThinkingLevel;
  searchEnabled: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface UserSettings {
  apiKey: string | null;
  defaultModel: string;
  defaultThinking: ThinkingLevel;
  defaultSearchEnabled: boolean;
  theme: "light" | "dark" | "system";
  favoriteModels: string[];
}

export interface OpenRouterModel {
  id: string;
  name: string;
  provider: string;
  thinking?: boolean;
  search?: boolean;
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  prompt: string;
  createdAt: number;
}
