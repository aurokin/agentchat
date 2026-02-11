export const APP_DEFAULT_MODEL = "moonshotai/kimi-k2.5";

export interface OpenRouterModel {
    id: string;
    name: string;
    provider: string;
    supportedParameters?: SupportedParameter[];
}

export enum SupportedParameter {
    Tools = "tools",
    Reasoning = "reasoning",
    Vision = "vision",
}

export function modelSupportsSearch(
    model: OpenRouterModel | undefined,
): boolean {
    return (
        model?.supportedParameters?.includes(SupportedParameter.Tools) ?? false
    );
}

export function modelSupportsReasoning(
    model: OpenRouterModel | undefined,
): boolean {
    return (
        model?.supportedParameters?.includes(SupportedParameter.Reasoning) ??
        false
    );
}

export function modelSupportsVision(
    model: OpenRouterModel | undefined,
): boolean {
    return (
        model?.supportedParameters?.includes(SupportedParameter.Vision) ?? false
    );
}
