"use client";

import React, { useState } from "react";
import { Sidebar } from "@/components/chat/Sidebar";
import { useSettings } from "@/contexts/SettingsContext";
import { useUser } from "@clerk/nextjs";
import { validateApiKey } from "@/lib/openrouter";
import { Settings, Key, Moon, Sun, Monitor, Check, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export default function SettingsPage() {
  const { user, isLoaded } = useUser();
  const { apiKey, setApiKey, clearApiKey, theme, setTheme } = useSettings();
  const [newApiKey, setNewApiKey] = useState(apiKey || "");
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  // Redirect if not authenticated
  React.useEffect(() => {
    if (isLoaded && !user) {
      window.location.href = "/sign-in";
    }
  }, [isLoaded, user]);

  const handleValidate = async () => {
    if (!newApiKey.trim()) return;
    setValidating(true);
    setValidationResult(null);
    const isValid = await validateApiKey(newApiKey.trim());
    setValidationResult(isValid);
    setValidating(false);
  };

  const handleSave = () => {
    setSaving(true);
    if (newApiKey.trim()) {
      setApiKey(newApiKey.trim());
    } else {
      clearApiKey();
    }
    setSaving(false);
  };

  const handleClear = () => {
    setNewApiKey("");
    clearApiKey();
    setValidationResult(null);
  };

  if (!isLoaded || !user) {
    return null;
  }

  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 overflow-y-auto bg-gray-50">
        <div className="max-w-2xl mx-auto p-8">
          <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
            <Settings size={24} />
            Settings
          </h1>

          {/* OpenRouter API Key */}
          <section className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Key size={20} />
              OpenRouter API Key
            </h2>

            <p className="text-sm text-gray-600 mb-4">
              Enter your OpenRouter API key to enable chatting with AI models.
              Your key is stored locally and never sent to our servers.
            </p>

            <div className="space-y-4">
              <div>
                <label htmlFor="apiKey" className="block text-sm font-medium mb-1">
                  API Key
                </label>
                <input
                  id="apiKey"
                  type="password"
                  value={newApiKey}
                  onChange={(e) => {
                    setNewApiKey(e.target.value);
                    setValidationResult(null);
                  }}
                  placeholder="sk-..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {apiKey && (
                <p className="text-sm text-green-600 flex items-center gap-1">
                  <Check size={16} />
                  API key is saved
                </p>
              )}

              <div className="flex gap-2">
                <button
                  onClick={handleValidate}
                  disabled={validating || !newApiKey.trim()}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 flex items-center gap-2"
                >
                  {validating ? <Loader2 size={16} className="animate-spin" /> : null}
                  Verify Key
                </button>

                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Save"}
                </button>

                {apiKey && (
                  <button
                    onClick={handleClear}
                    className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg"
                  >
                    Clear
                  </button>
                )}
              </div>

              {validationResult === true && (
                <p className="text-sm text-green-600 flex items-center gap-1">
                  <Check size={16} />
                  Valid API key
                </p>
              )}

              {validationResult === false && (
                <p className="text-sm text-red-600 flex items-center gap-1">
                  <X size={16} />
                  Invalid API key
                </p>
              )}

              <p className="text-xs text-gray-500">
                Get your API key from{" "}
                <a
                  href="https://openrouter.ai/keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  openrouter.ai/keys
                </a>
              </p>
            </div>
          </section>

          {/* Theme */}
          <section className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              Theme
            </h2>

            <div className="grid grid-cols-3 gap-4">
              <button
                onClick={() => setTheme("light")}
                className={cn(
                  "p-4 border rounded-lg flex flex-col items-center gap-2 transition-colors",
                  theme === "light"
                    ? "border-blue-500 bg-blue-50"
                    : "border-gray-200 hover:bg-gray-50"
                )}
              >
                <Sun size={24} />
                <span className="text-sm">Light</span>
              </button>

              <button
                onClick={() => setTheme("dark")}
                className={cn(
                  "p-4 border rounded-lg flex flex-col items-center gap-2 transition-colors",
                  theme === "dark"
                    ? "border-blue-500 bg-blue-50"
                    : "border-gray-200 hover:bg-gray-50"
                )}
              >
                <Moon size={24} />
                <span className="text-sm">Dark</span>
              </button>

              <button
                onClick={() => setTheme("system")}
                className={cn(
                  "p-4 border rounded-lg flex flex-col items-center gap-2 transition-colors",
                  theme === "system"
                    ? "border-blue-500 bg-blue-50"
                    : "border-gray-200 hover:bg-gray-50"
                )}
              >
                <Monitor size={24} />
                <span className="text-sm">System</span>
              </button>
            </div>
          </section>

          {/* About */}
          <section className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4">About</h2>
            <p className="text-sm text-gray-600">
              OpenRouter Chat lets you chat with AI models through OpenRouter.
              Your conversations are stored locally in your browser.
            </p>
            <p className="text-sm text-gray-500 mt-2">
              Version 0.1.0
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
