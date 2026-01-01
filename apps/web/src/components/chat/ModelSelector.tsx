"use client";

import React from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ModelSelectorProps {
  models: Array<{ id: string; name: string }>;
  selectedModel: string;
  onModelChange: (modelId: string) => void;
  loading?: boolean;
}

export function ModelSelector({
  models,
  selectedModel,
  onModelChange,
  loading,
}: ModelSelectorProps) {
  const [isOpen, setIsOpen] = React.useState(false);

  const handleSelect = (modelId: string) => {
    onModelChange(modelId);
    setIsOpen(false);
  };

  // Group models by provider
  const groupedModels = models.reduce((acc, model) => {
    const provider = model.id.split("/")[0] || "other";
    if (!acc[provider]) {
      acc[provider] = [];
    }
    acc[provider].push(model);
    return acc;
  }, {} as Record<string, typeof models>);

  // Default models if none loaded
  const displayModels = models.length > 0 ? groupedModels : {
    default: [
      { id: "openrouter/gpt-4o", name: "GPT-4o" },
      { id: "openrouter/gpt-4o-mini", name: "GPT-4o-mini" },
      { id: "anthropic/claude-3.5-sonnet", name: "Claude 3.5 Sonnet" },
      { id: "anthropic/claude-3-haiku", name: "Claude 3 Haiku" },
    ],
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        disabled={loading}
        className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
      >
        {loading ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          <ChevronDown size={16} />
        )}
        <span className="text-sm font-medium max-w-48 truncate">
          {selectedModel.split("/").pop() || selectedModel}
        </span>
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute top-full left-0 mt-1 w-72 max-h-80 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg z-20">
            {Object.entries(displayModels).map(([provider, providerModels]) => (
              <div key={provider}>
                <div className="px-3 py-2 bg-gray-50 text-xs font-semibold text-gray-500 uppercase">
                  {provider}
                </div>
                {providerModels.map((model) => (
                  <button
                    key={model.id}
                    type="button"
                    onClick={() => handleSelect(model.id)}
                    className={cn(
                      "w-full text-left px-3 py-2 text-sm hover:bg-gray-100 focus:outline-none",
                      model.id === selectedModel && "bg-blue-50 text-blue-600"
                    )}
                  >
                    {model.name}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
