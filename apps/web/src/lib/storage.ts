const STORAGE_KEYS = {
  API_KEY: "openrouter-api-key",
  THEME: "openrouter-theme",
  DEFAULT_MODEL: "openrouter-default-model",
  FAVORITE_MODELS: "openrouter-favorite-models",
} as const;

export function getApiKey(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(STORAGE_KEYS.API_KEY);
}

export function setApiKey(key: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEYS.API_KEY, key);
}

export function clearApiKey(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEYS.API_KEY);
}

export function getTheme(): "light" | "dark" | "system" {
  if (typeof window === "undefined") return "system";
  return (localStorage.getItem(STORAGE_KEYS.THEME) as "light" | "dark" | "system") || "system";
}

export function setTheme(theme: "light" | "dark" | "system"): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEYS.THEME, theme);
}

export function getDefaultModel(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(STORAGE_KEYS.DEFAULT_MODEL) || "";
}

export function setDefaultModel(modelId: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEYS.DEFAULT_MODEL, modelId);
}

export function getFavoriteModels(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.FAVORITE_MODELS);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export function setFavoriteModels(modelIds: string[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEYS.FAVORITE_MODELS, JSON.stringify(modelIds));
}
