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
    _model: OpenRouterModel | undefined,
): boolean {
    return false;
}

export function modelSupportsReasoning(
    _model: OpenRouterModel | undefined,
): boolean {
    return false;
}

export function modelSupportsVision(
    _model: OpenRouterModel | undefined,
): boolean {
    return false;
}
