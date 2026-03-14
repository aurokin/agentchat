import type { ReasoningEffort } from "../types";

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

const REASONING_EFFORT_VARIANTS = new Set<ReasoningEffort>([
    "xhigh",
    "high",
    "medium",
    "low",
    "minimal",
    "none",
]);

export function resolveReasoningEffortForVariant(
    variantId: string | null | undefined,
    fallback: ReasoningEffort = "none",
): ReasoningEffort {
    if (!variantId) {
        return fallback;
    }

    if (REASONING_EFFORT_VARIANTS.has(variantId as ReasoningEffort)) {
        return variantId as ReasoningEffort;
    }

    return fallback;
}
