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
    code: number,
    metadata?: Record<string, unknown>,
): string {
    switch (code) {
        case 400:
            return "Invalid request. Please check your input.";
        case 401:
            return "Invalid API key. Please check your settings.";
        case 402:
            return "Insufficient credits. Please add credits to your account.";
        case 403:
            const reasons = metadata?.reasons as string[] | undefined;
            if (reasons && reasons.length > 0) {
                return "Your message was flagged by moderation.";
            }
            return "Access denied. You may not have permission to use this model.";
        case 408:
            return "Request timed out. Please try again.";
        case 429:
            return "Too many requests. Please wait before trying again.";
        case 502:
            return "Model is temporarily unavailable. Try another model.";
        case 503:
            return "No providers available. Try again later.";
        default:
            if (code >= 500) {
                return "Server error. Please try again later.";
            }
            return "An unexpected error occurred. Please try again.";
    }
}

export function isRetryableError(code: number): boolean {
    return [408, 429, 502, 503].includes(code);
}

export function parseOpenRouterError(
    response: Response,
    body?: unknown,
): OpenRouterError {
    const code = response.status;
    let message = response.statusText;
    let metadata: OpenRouterError["metadata"];

    if (body && typeof body === "object") {
        const errorBody = body as {
            error?: { message?: string; metadata?: Record<string, unknown> };
        };

        if (errorBody.error?.message) {
            message = errorBody.error.message;
        }

        if (errorBody.error?.metadata) {
            const meta = errorBody.error.metadata;

            if (meta.provider_name || meta.raw) {
                metadata = {
                    providerName: meta.provider_name as string,
                    rawError: meta.raw,
                };
            }

            if (Array.isArray(meta.reasons) || meta.flagged_input) {
                metadata = {
                    ...metadata,
                    moderationReasons: meta.reasons as string[],
                    flaggedInput: meta.flagged_input as string,
                };
            }
        }
    }

    return {
        code,
        message,
        userMessage: getUserMessage(
            code,
            body && typeof body === "object"
                ? (body as { error?: { metadata?: Record<string, unknown> } })
                      .error?.metadata
                : undefined,
        ),
        isRetryable: isRetryableError(code),
        metadata,
    };
}

export function parseMidStreamError(
    chunk: Record<string, unknown>,
): OpenRouterError | null {
    const error = chunk.error as
        | { code?: string | number; message?: string }
        | undefined;
    const choices = chunk.choices as
        | Array<{ finish_reason?: string }>
        | undefined;

    if (choices?.[0]?.finish_reason === "error" && error) {
        const code = typeof error.code === "number" ? error.code : 500;
        return {
            code,
            message: error.message || "Unknown streaming error",
            userMessage: getUserMessage(code),
            isRetryable: isRetryableError(code),
        };
    }

    return null;
}

export function createErrorFromException(error: unknown): OpenRouterError {
    if (error instanceof Error) {
        return {
            code: 0,
            message: error.message,
            userMessage: "An error occurred. Please try again.",
            isRetryable: true,
        };
    }

    return {
        code: 0,
        message: String(error),
        userMessage: "An unexpected error occurred. Please try again.",
        isRetryable: true,
    };
}
