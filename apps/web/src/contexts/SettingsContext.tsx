"use client";

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import type { UserSettings, OpenRouterModel } from "@/lib/types";
import * as storage from "@/lib/storage";
import { fetchModels } from "@/lib/openrouter";

interface SettingsContextType extends UserSettings {
  setApiKey: (key: string) => void;
  clearApiKey: () => void;
  setDefaultModel: (modelId: string) => void;
  setTheme: (theme: UserSettings["theme"]) => void;
  models: OpenRouterModel[];
  loadingModels: boolean;
  refreshModels: () => Promise<void>;
}

const defaultSettings: UserSettings = {
  apiKey: null,
  defaultModel: "",
  theme: "system",
};

const SettingsContext = createContext<SettingsContextType | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<UserSettings>(defaultSettings);
  const [models, setModels] = useState<OpenRouterModel[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [mounted, setMounted] = useState(false);
  const refreshPromiseRef = useRef<Promise<void> | null>(null);

  const refreshModels = useCallback(async () => {
    const apiKey = storage.getApiKey();
    if (!apiKey) return;

    // Prevent duplicate requests
    if (refreshPromiseRef.current) {
      return refreshPromiseRef.current;
    }

    setLoadingModels(true);
    try {
      const promise = fetchModels(apiKey).then((fetchedModels) => {
        setModels(fetchedModels);
      });
      refreshPromiseRef.current = promise;
      await promise;
    } catch (err) {
      console.error("Failed to load models:", err);
    } finally {
      setLoadingModels(false);
      refreshPromiseRef.current = null;
    }
  }, []);

  useEffect(() => {
    setSettings({
      apiKey: storage.getApiKey(),
      defaultModel: storage.getDefaultModel(),
      theme: storage.getTheme(),
    });
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && storage.getApiKey()) {
      refreshModels();
    }
  }, [mounted, refreshModels]);

  const setApiKey = (key: string) => {
    storage.setApiKey(key);
    setSettings((prev) => ({ ...prev, apiKey: key }));
    if (key) {
      refreshModels();
    } else {
      setModels([]);
    }
  };

  const clearApiKey = () => {
    storage.clearApiKey();
    setSettings((prev) => ({ ...prev, apiKey: null }));
    setModels([]);
  };

  const setDefaultModel = (modelId: string) => {
    storage.setDefaultModel(modelId);
    setSettings((prev) => ({ ...prev, defaultModel: modelId }));
  };

  const setTheme = (theme: UserSettings["theme"]) => {
    storage.setTheme(theme);
    setSettings((prev) => ({ ...prev, theme }));

    if (typeof window !== "undefined") {
      const root = window.document.documentElement;
      root.classList.remove("light", "dark");

      if (theme === "system") {
        const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";
        root.classList.add(systemTheme);
      } else {
        root.classList.add(theme);
      }
    }
  };

  useEffect(() => {
    if (mounted) {
      setTheme(settings.theme);
    }
  }, [mounted, settings.theme]);

  return (
    <SettingsContext.Provider
      value={{
        ...settings,
        setApiKey,
        clearApiKey,
        setDefaultModel,
        setTheme,
        models,
        loadingModels,
        refreshModels,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error("useSettings must be used within a SettingsProvider");
  }
  return context;
}
