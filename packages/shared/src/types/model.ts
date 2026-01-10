export interface OpenRouterModel {
    id: string;
    name: string;
    provider: string;
    thinking?: boolean;
    search?: boolean;
}

export interface ModelResponse {
    data: Array<{
        id: string;
        object: string;
        created: number;
        owned_by: string;
    }>;
}
