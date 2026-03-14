import type { ThinkingLevel } from "../types";

export const APP_DEFAULT_MODEL = "gpt-5.4";

export interface ProviderVariant {
    id: string;
    label: string;
}

export interface ProviderModel {
    id: string;
    name: string;
    providerId?: string;
    provider: string;
    supportedParameters?: SupportedParameter[];
    variants?: ProviderVariant[];
}

export enum SupportedParameter {
    Tools = "tools",
    Reasoning = "reasoning",
    Vision = "vision",
}

export function modelSupportsSearch(model: ProviderModel | undefined): boolean {
    return (
        model?.supportedParameters?.includes(SupportedParameter.Tools) ?? false
    );
}

export function modelSupportsReasoning(
    model: ProviderModel | undefined,
): boolean {
    return (
        model?.supportedParameters?.includes(SupportedParameter.Reasoning) ??
        false
    );
}

export function modelSupportsVision(model: ProviderModel | undefined): boolean {
    return (
        model?.supportedParameters?.includes(SupportedParameter.Vision) ?? false
    );
}

const THINKING_LEVEL_VARIANTS = new Set<ThinkingLevel>([
    "xhigh",
    "high",
    "medium",
    "low",
    "minimal",
    "none",
]);

const LEGACY_CODEX_VARIANT_TO_THINKING: Record<string, ThinkingLevel> = {
    fast: "low",
    balanced: "medium",
    deep: "high",
};

export function resolveThinkingLevelForVariant(
    variantId: string | null | undefined,
    fallback: ThinkingLevel = "none",
): ThinkingLevel {
    if (!variantId) {
        return fallback;
    }

    if (THINKING_LEVEL_VARIANTS.has(variantId as ThinkingLevel)) {
        return variantId as ThinkingLevel;
    }

    return LEGACY_CODEX_VARIANT_TO_THINKING[variantId] ?? fallback;
}
