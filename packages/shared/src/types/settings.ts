export interface UserSettings {
  apiKey: string | null;
  defaultModel: string;
  theme: "light" | "dark" | "system";
  favoriteModels: string[];
}
