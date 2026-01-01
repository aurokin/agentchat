"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import type { UserSettings } from "@/lib/types";
import * as storage from "@/lib/storage";

interface SettingsContextType extends UserSettings {
  setApiKey: (key: string) => void;
  clearApiKey: () => void;
  setDefaultModel: (modelId: string) => void;
  setTheme: (theme: UserSettings["theme"]) => void;
}

const defaultSettings: UserSettings = {
  apiKey: null,
  defaultModel: "",
  theme: "system",
};

const SettingsContext = createContext<SettingsContextType | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<UserSettings>(defaultSettings);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setSettings({
      apiKey: storage.getApiKey(),
      defaultModel: storage.getDefaultModel(),
      theme: storage.getTheme(),
    });
    setMounted(true);
  }, []);

  const setApiKey = (key: string) => {
    storage.setApiKey(key);
    setSettings((prev) => ({ ...prev, apiKey: key }));
  };

  const clearApiKey = () => {
    storage.clearApiKey();
    setSettings((prev) => ({ ...prev, apiKey: null }));
  };

  const setDefaultModel = (modelId: string) => {
    storage.setDefaultModel(modelId);
    setSettings((prev) => ({ ...prev, defaultModel: modelId }));
  };

  const setTheme = (theme: UserSettings["theme"]) => {
    storage.setTheme(theme);
    setSettings((prev) => ({ ...prev, theme }));

    // Apply theme to document
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

  // Apply theme on mount
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
