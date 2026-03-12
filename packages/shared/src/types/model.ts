export enum SupportedParameter {
    Tools = "tools",
    Reasoning = "reasoning",
}

export interface ProviderModel {
    id: string;
    name: string;
    provider: string;
    supportedParameters?: SupportedParameter[];
}

export interface ModelResponse {
    data: Array<{
        id: string;
        object: string;
        created: number;
        owned_by: string;
    }>;
}
