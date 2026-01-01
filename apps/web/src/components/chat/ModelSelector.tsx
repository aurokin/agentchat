"use client";

import React from "react";
import { ChevronDown, Loader2, Cpu } from "lucide-react";
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
        className={cn(
          "flex items-center gap-2 px-3 py-2 bg-muted border-2 border-border transition-all duration-150",
          "hover:border-primary hover:bg-muted/80",
          loading && "opacity-50 cursor-not-allowed"
        )}
      >
        {loading ? (
          <Loader2 size={16} className="animate-spin text-primary" />
        ) : (
          <Cpu size={16} className="text-primary" />
        )}
        <span className="text-sm font-medium max-w-48 truncate">
          {selectedModel.split("/").pop() || selectedModel}
        </span>
        <ChevronDown size={14} className="text-muted-foreground" />
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute top-full left-0 mt-1 w-80 max-h-72 overflow-y-auto bg-muted border-2 border-border shadow-brutal z-50">
            {Object.entries(displayModels).map(([provider, providerModels]) => (
              <div key={provider}>
                <div className="px-3 py-2 bg-primary/10 border-b border-border">
                  <span className="mono text-xs font-bold text-primary uppercase">
                    {provider}
                  </span>
                </div>
                {providerModels.map((model) => (
                  <button
                    key={model.id}
                    type="button"
                    onClick={() => handleSelect(model.id)}
                    className={cn(
                      "w-full text-left px-3 py-2 text-sm transition-colors hover:bg-primary/10 hover:text-primary",
                      model.id === selectedModel && "bg-primary/20 text-primary"
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
