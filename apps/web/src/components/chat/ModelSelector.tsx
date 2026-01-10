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
    const { models, loadingModels, favoriteModels, toggleFavoriteModel } =
        useSettings();
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

        const others = models.filter(
            (model) => !favoriteModels.includes(model.id),
        );

        return { favoriteModelList: favorites, otherModels: others };
    }, [models, favoriteModels]);

    // Group non-favorites by provider
    const groupedModels = useMemo(() => {
        return otherModels.reduce(
            (acc, model) => {
                const provider = model.id.split("/")[0] || "other";
                if (!acc[provider]) {
                    acc[provider] = [];
                }
                acc[provider].push(model);
                return acc;
            },
            {} as Record<string, typeof models>,
        );
    }, [otherModels]);

    return (
        <div className="relative" ref={containerRef}>
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                disabled={loadingModels}
                className={cn(
                    "flex items-center gap-2.5 px-4 py-2.5 bg-background-elevated border border-border transition-all duration-200",
                    "hover:border-primary/30 hover:bg-muted/50",
                    isOpen && "border-primary/50",
                    loadingModels && "opacity-50 cursor-not-allowed",
                )}
            >
                {loadingModels ? (
                    <Loader2 size={14} className="animate-spin text-primary" />
                ) : (
                    <Cpu size={14} className="text-primary" />
                )}
                <span className="text-sm font-medium max-w-48 truncate">
                    {selectedModel.split("/").pop() || selectedModel}
                </span>
                <ChevronDown
                    size={14}
                    className={cn(
                        "text-muted-foreground transition-transform",
                        isOpen && "rotate-180",
                    )}
                />
            </button>

            {isOpen && (
                <div className="absolute z-[100] w-80 max-h-80 overflow-y-auto bg-background-elevated border border-border shadow-deco-elevated mt-2 animate-fade-in">
                    {models.length === 0 && !loadingModels && (
                        <div className="px-4 py-6 text-center text-muted-foreground text-sm">
                            <Cpu
                                size={24}
                                className="mx-auto mb-2 opacity-50"
                            />
                            <p>No models available</p>
                            <p className="text-xs mt-1">
                                Add an API key to fetch models
                            </p>
                        </div>
                    )}

                    {/* Favorites section */}
                    {favoriteModelList.length > 0 && (
                        <div>
                            <div className="px-4 py-2 bg-primary/5 border-b border-border">
                                <span className="text-xs font-medium text-primary uppercase tracking-wider flex items-center gap-1.5">
                                    <Star size={10} className="fill-primary" />
                                    Favorites
                                </span>
                            </div>
                            {favoriteModelList.map((model) => (
                                <button
                                    key={model.id}
                                    type="button"
                                    onClick={() => handleSelect(model.id)}
                                    className={cn(
                                        "w-full text-left px-4 py-2.5 text-sm transition-all duration-150 hover:bg-primary/5 cursor-pointer flex items-center gap-2.5",
                                        model.id === selectedModel &&
                                            "bg-primary/10 border-l-2 border-primary",
                                    )}
                                >
                                    <Star
                                        size={12}
                                        className="text-primary fill-primary flex-shrink-0"
                                    />
                                    <span className="truncate text-foreground">
                                        {model.name}
                                    </span>
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Provider groups */}
                    {Object.entries(groupedModels).map(
                        ([provider, providerModels]) => (
                            <div key={provider}>
                                <div className="px-4 py-2 bg-muted/50 border-b border-border">
                                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                        {provider}
                                    </span>
                                </div>
                                {providerModels.map((model) => (
                                    <button
                                        key={model.id}
                                        type="button"
                                        onClick={() => handleSelect(model.id)}
                                        className={cn(
                                            "w-full text-left px-4 py-2.5 text-sm transition-all duration-150 hover:bg-primary/5 cursor-pointer flex items-center gap-2.5 group",
                                            model.id === selectedModel &&
                                                "bg-primary/10 border-l-2 border-primary",
                                        )}
                                    >
                                        <div
                                            role="button"
                                            tabIndex={0}
                                            onClick={(e) =>
                                                handleToggleFavorite(
                                                    e,
                                                    model.id,
                                                )
                                            }
                                            onKeyDown={(e) =>
                                                e.key === "Enter" &&
                                                handleToggleFavorite(
                                                    e as unknown as React.MouseEvent,
                                                    model.id,
                                                )
                                            }
                                            className="p-1 hover:bg-muted rounded-sm transition-colors cursor-pointer"
                                            title={
                                                favoriteModels.includes(
                                                    model.id,
                                                )
                                                    ? "Remove from favorites"
                                                    : "Add to favorites"
                                            }
                                        >
                                            <Star
                                                size={12}
                                                className={cn(
                                                    "flex-shrink-0 transition-colors",
                                                    favoriteModels.includes(
                                                        model.id,
                                                    )
                                                        ? "text-primary fill-primary"
                                                        : "text-muted-foreground group-hover:text-primary/50",
                                                )}
                                            />
                                        </div>
                                        <span className="truncate text-foreground">
                                            {model.name}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        ),
                    )}
                </div>
            )}
        </div>
    );
}
