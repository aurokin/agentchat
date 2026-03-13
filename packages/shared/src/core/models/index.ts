export const APP_DEFAULT_MODEL = "moonshotai/kimi-k2.5";

export interface ProviderModel {
    id: string;
    name: string;
    providerId?: string;
    provider: string;
    supportedParameters?: SupportedParameter[];
    variants?: Array<{
        id: string;
        label: string;
    }>;
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
