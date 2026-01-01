"use client";

import React, { useRef, useEffect, useMemo } from "react";
import { ChevronDown, Loader2, Cpu, Star } from "lucide-react";
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
  const { models, loadingModels, favoriteModels, toggleFavoriteModel } = useSettings();
  const [isOpen, setIsOpen] = React.useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      // Also close on escape key
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === "Escape") setIsOpen(false);
      };
      document.addEventListener("keydown", handleEscape);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
        document.removeEventListener("keydown", handleEscape);
      };
    }
  }, [isOpen]);

  const handleSelect = (modelId: string) => {
    onModelChange(modelId);
    setIsOpen(false);
  };

  const handleToggleFavorite = (e: React.MouseEvent, modelId: string) => {
    e.stopPropagation();
    toggleFavoriteModel(modelId);
  };

  // Separate favorites and non-favorites
  const { favoriteModelList, otherModels } = useMemo(() => {
    const favorites = models
      .filter((model) => favoriteModels.includes(model.id))
      .sort((a, b) => a.name.localeCompare(b.name));

    const others = models.filter((model) => !favoriteModels.includes(model.id));

    return { favoriteModelList: favorites, otherModels: others };
  }, [models, favoriteModels]);

  // Group non-favorites by provider
  const groupedModels = useMemo(() => {
    return otherModels.reduce((acc, model) => {
      const provider = model.id.split("/")[0] || "other";
      if (!acc[provider]) {
        acc[provider] = [];
      }
      acc[provider].push(model);
      return acc;
    }, {} as Record<string, typeof models>);
  }, [otherModels]);

  return (
    <div className="relative" ref={containerRef}>
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
        <div
          className="absolute z-[100] w-80 max-h-72 overflow-y-auto bg-muted border-2 border-border shadow-brutal cursor-pointer mt-1"
        >
          {models.length === 0 && !loadingModels && (
            <div className="px-3 py-4 text-center text-muted-foreground text-sm">
              No models available. Add an API key to fetch models.
            </div>
          )}

          {/* Favorites section */}
          {favoriteModelList.length > 0 && (
            <div>
              <div className="px-3 py-2 bg-yellow-500/10 border-b border-border">
                <span className="mono text-xs font-bold text-yellow-600 uppercase flex items-center gap-1">
                  <Star size={12} className="fill-yellow-500" />
                  Favorites
                </span>
              </div>
              {favoriteModelList.map((model) => (
                <button
                  key={model.id}
                  type="button"
                  onClick={() => handleSelect(model.id)}
                  className={cn(
                    "w-full text-left px-3 py-2 text-sm transition-colors hover:bg-primary/10 hover:text-primary cursor-pointer flex items-center gap-2",
                    model.id === selectedModel && "bg-primary/20 text-primary"
                  )}
                >
                  <Star
                    size={14}
                    className="text-yellow-500 fill-yellow-500 flex-shrink-0"
                  />
                  <span className="truncate">{model.name}</span>
                </button>
              ))}
            </div>
          )}

          {/* Provider groups */}
          {Object.entries(groupedModels).map(([provider, providerModels]) => (
            <div key={provider}>
              <div className="px-3 py-2 bg-primary/5 border-b border-border">
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
                    "w-full text-left px-3 py-2 text-sm transition-colors hover:bg-primary/10 hover:text-primary cursor-pointer flex items-center gap-2",
                    model.id === selectedModel && "bg-primary/20 text-primary"
                  )}
                >
                  <button
                    type="button"
                    onClick={(e) => handleToggleFavorite(e, model.id)}
                    className="p-0.5 hover:bg-muted rounded transition-colors"
                    title={favoriteModels.includes(model.id) ? "Remove from favorites" : "Add to favorites"}
                  >
                    <Star
                      size={14}
                      className={cn(
                        "flex-shrink-0",
                        favoriteModels.includes(model.id)
                          ? "text-yellow-500 fill-yellow-500"
                          : "text-muted-foreground"
                      )}
                    />
                  </button>
                  <span className="truncate">{model.name}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
