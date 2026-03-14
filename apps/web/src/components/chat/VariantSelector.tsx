"use client";

import type { ProviderVariant } from "@shared/core/models";
import { cn } from "@/lib/utils";

interface VariantSelectorProps {
    variants: ProviderVariant[];
    selectedVariantId: string | null;
    onVariantChange: (variantId: string) => void;
    disabled?: boolean;
}

export function VariantSelector({
    variants,
    selectedVariantId,
    onVariantChange,
    disabled = false,
}: VariantSelectorProps) {
    if (variants.length <= 1) {
        return null;
    }

    return (
        <div className="flex items-center gap-1.5 overflow-x-auto">
            {variants.map((variant) => {
                const isSelected = selectedVariantId === variant.id;
                return (
                    <button
                        key={variant.id}
                        type="button"
                        onClick={() => onVariantChange(variant.id)}
                        disabled={disabled}
                        className={cn(
                            "px-3 py-1.5 text-xs font-medium border transition-all duration-200 whitespace-nowrap",
                            isSelected
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-border bg-background-elevated text-foreground-muted hover:border-primary/30 hover:text-foreground",
                            disabled && "opacity-50 cursor-not-allowed",
                        )}
                    >
                        {variant.label}
                    </button>
                );
            })}
        </div>
    );
}
