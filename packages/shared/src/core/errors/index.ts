export interface OpenRouterError {
    code: number;
    message: string;
    userMessage: string;
    isRetryable: boolean;
    metadata?: {
        providerName?: string;
        rawError?: unknown;
        moderationReasons?: string[];
        flaggedInput?: string;
    };
}

export function getUserMessage(
    _code: number,
    _metadata?: Record<string, unknown>,
): string {
    return "An error occurred. Please try again.";
}

export function isRetryableError(_code: number): boolean {
    return false;
}

export function parseOpenRouterError(
    _response: Response,
    _body?: unknown,
): OpenRouterError {
    return {
        code: 0,
        message: "Unknown error",
        userMessage: "An error occurred. Please try again.",
        isRetryable: true,
    };
}

export function parseMidStreamError(
    _chunk: Record<string, unknown>,
): OpenRouterError | null {
    return null;
}

export function createErrorFromException(_error: unknown): OpenRouterError {
    return {
        code: 0,
        message: "Unknown error",
        userMessage: "An error occurred. Please try again.",
        isRetryable: true,
    };
}
