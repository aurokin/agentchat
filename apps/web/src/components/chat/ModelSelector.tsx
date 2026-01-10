"use client";

import React, { useRef, useEffect, useMemo, useState } from "react";
import { ChevronDown, Loader2, Cpu, Star, Search } from "lucide-react";
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
    const [isOpen, setIsOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const containerRef = useRef<HTMLDivElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);

    // Focus search input when dropdown opens
    useEffect(() => {
        if (isOpen && searchInputRef.current) {
            // Small delay to ensure the dropdown is rendered
            setTimeout(() => searchInputRef.current?.focus(), 50);
        }
        if (!isOpen) {
            setSearchQuery("");
        }
    }, [isOpen]);

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

    // Filter models based on search query
    const filteredModels = useMemo(() => {
        if (!searchQuery.trim()) return models;
        const query = searchQuery.toLowerCase();
        return models.filter(
            (model) =>
                model.id.toLowerCase().includes(query) ||
                model.name.toLowerCase().includes(query) ||
                model.provider?.toLowerCase().includes(query),
        );
    }, [models, searchQuery]);

    // Separate favorites and non-favorites from filtered results
    const { favoriteModelList, otherModels } = useMemo(() => {
        const favorites = filteredModels
            .filter((model) => favoriteModels.includes(model.id))
            .sort((a, b) => a.name.localeCompare(b.name));

        const others = filteredModels.filter(
            (model) => !favoriteModels.includes(model.id),
        );

        return { favoriteModelList: favorites, otherModels: others };
    }, [filteredModels, favoriteModels]);

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
                <div className="absolute z-[100] w-80 bg-background-elevated border border-border shadow-deco-elevated bottom-full mb-2 animate-fade-in flex flex-col">
                    {/* Search input - sticky at top */}
                    <div className="p-2 border-b border-border bg-background-elevated sticky top-0 z-10">
                        <div className="relative">
                            <Search
                                size={14}
                                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
                            />
                            <input
                                ref={searchInputRef}
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search models..."
                                className={cn(
                                    "w-full pl-9 pr-3 py-2 text-sm bg-muted border border-border",
                                    "placeholder:text-muted-foreground text-foreground",
                                    "focus:outline-none focus:border-primary/50 focus:bg-background",
                                    "transition-all duration-200",
                                )}
                            />
                            {searchQuery && (
                                <button
                                    type="button"
                                    onClick={() => setSearchQuery("")}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs px-1.5 py-0.5 bg-border/50 hover:bg-border transition-colors"
                                >
                                    ESC
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Scrollable model list */}
                    <div className="max-h-64 overflow-y-auto">
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

                        {/* No search results */}
                        {models.length > 0 &&
                            filteredModels.length === 0 &&
                            searchQuery && (
                                <div className="px-4 py-6 text-center text-muted-foreground text-sm">
                                    <Search
                                        size={24}
                                        className="mx-auto mb-2 opacity-50"
                                    />
                                    <p>No models found</p>
                                    <p className="text-xs mt-1">
                                        Try a different search term
                                    </p>
                                </div>
                            )}

                        {/* Favorites section */}
                        {favoriteModelList.length > 0 && (
                            <div>
                                <div className="px-4 py-2 bg-primary/5 border-b border-border">
                                    <span className="text-xs font-medium text-primary uppercase tracking-wider flex items-center gap-1.5">
                                        <Star
                                            size={10}
                                            className="fill-primary"
                                        />
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
                                            onClick={() =>
                                                handleSelect(model.id)
                                            }
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
                </div>
            )}
        </div>
    );
}
