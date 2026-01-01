"use client";

import React from "react";
import { ChevronDown, Loader2, Cpu } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSettings } from "@/contexts/SettingsContext";

interface ModelSelectorProps {
  selectedModel: string;
  onModelChange: (modelId: string) => void;
}

export function ModelSelector({
  selectedModel,
  onModelChange,
}: ModelSelectorProps) {
  const { models, loadingModels } = useSettings();
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

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        disabled={loadingModels}
        className={cn(
          "flex items-center gap-2 px-3 py-2 bg-muted border-2 border-border transition-all duration-150",
          "hover:border-primary hover:bg-muted/80",
          loadingModels && "opacity-50 cursor-not-allowed"
        )}
      >
        {loadingModels ? (
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
            className="fixed inset-0 z-40 cursor-default"
            onClick={(e) => {
              e.stopPropagation();
              setIsOpen(false);
            }}
          />
          <div
            className="absolute top-full left-0 mt-1 w-80 max-h-72 overflow-y-auto bg-muted border-2 border-border shadow-brutal z-50 cursor-default"
            onClick={(e) => e.stopPropagation()}
          >
            {models.length === 0 && !loadingModels && (
              <div className="px-3 py-4 text-center text-muted-foreground text-sm">
                No models available. Add an API key to fetch models.
              </div>
            )}
            {Object.entries(groupedModels).map(([provider, providerModels]) => (
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
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSelect(model.id);
                    }}
                    className={cn(
                      "w-full text-left px-3 py-2 text-sm transition-colors hover:bg-primary/10 hover:text-primary cursor-pointer",
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
