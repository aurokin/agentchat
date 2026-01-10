import { test, expect, describe, beforeEach } from "bun:test";
import {
    getUserMessage,
    isRetryableError,
    parseOpenRouterError,
    parseMidStreamError,
    createErrorFromException,
} from "@/lib/errors";

describe("getUserMessage", () => {
    test("returns_invalid_request_for_400", () => {
        expect(getUserMessage(400)).toBe(
            "Invalid request. Please check your input.",
        );
    });

    test("returns_invalid_api_key_for_401", () => {
        expect(getUserMessage(401)).toBe(
            "Invalid API key. Please check your settings.",
        );
    });

    test("returns_insufficient_credits_for_402", () => {
        expect(getUserMessage(402)).toBe(
            "Insufficient credits. Please add credits to your account.",
        );
    });

    test("returns_moderation_flagged_for_403", () => {
        expect(getUserMessage(403)).toBe(
            "Access denied. You may not have permission to use this model.",
        );
    });

    test("returns_moderation_flagged_with_reasons_for_403", () => {
        const metadata = { reasons: ["hate"] };
        expect(getUserMessage(403, metadata)).toBe(
            "Your message was flagged by moderation.",
        );
    });

    test("returns_request_timeout_for_408", () => {
        expect(getUserMessage(408)).toBe(
            "Request timed out. Please try again.",
        );
    });

    test("returns_rate_limit_for_429", () => {
        expect(getUserMessage(429)).toBe(
            "Too many requests. Please wait before trying again.",
        );
    });

    test("returns_model_unavailable_for_502", () => {
        expect(getUserMessage(502)).toBe(
            "Model is temporarily unavailable. Try another model.",
        );
    });

    test("returns_no_provider_for_503", () => {
        expect(getUserMessage(503)).toBe(
            "No providers available. Try again later.",
        );
    });

    test("returns_server_error_for_500", () => {
        expect(getUserMessage(500)).toBe(
            "Server error. Please try again later.",
        );
    });

    test("returns_unexpected_error_for_unknown_code", () => {
        expect(getUserMessage(418)).toBe(
            "An unexpected error occurred. Please try again.",
        );
    });
});

describe("isRetryableError", () => {
    test("returns_true_for_rate_limit_429", () => {
        expect(isRetryableError(429)).toBe(true);
    });

    test("returns_true_for_timeout_408", () => {
        expect(isRetryableError(408)).toBe(true);
    });

    test("returns_true_for_model_down_502", () => {
        expect(isRetryableError(502)).toBe(true);
    });

    test("returns_true_for_no_provider_503", () => {
        expect(isRetryableError(503)).toBe(true);
    });

    test("returns_false_for_invalid_key_401", () => {
        expect(isRetryableError(401)).toBe(false);
    });

    test("returns_false_for_insufficient_credits_402", () => {
        expect(isRetryableError(402)).toBe(false);
    });

    test("returns_false_for_moderation_403", () => {
        expect(isRetryableError(403)).toBe(false);
    });

    test("returns_false_for_bad_request_400", () => {
        expect(isRetryableError(400)).toBe(false);
    });
});

describe("parseOpenRouterError", () => {
    test("parses_401_invalid_key_error", () => {
        const response = new Response(null, { status: 401 });
        const body = {
            error: {
                code: 401,
                message: "Invalid API key",
            },
        };

        const error = parseOpenRouterError(response, body);

        expect(error.code).toBe(401);
        expect(error.message).toBe("Invalid API key");
        expect(error.userMessage).toBe(
            "Invalid API key. Please check your settings.",
        );
        expect(error.isRetryable).toBe(false);
    });

    test("parses_402_no_credits_error", () => {
        const response = new Response(null, { status: 402 });
        const body = {
            error: {
                code: 402,
                message: "Insufficient credits",
            },
        };

        const error = parseOpenRouterError(response, body);

        expect(error.code).toBe(402);
        expect(error.userMessage).toBe(
            "Insufficient credits. Please add credits to your account.",
        );
        expect(error.isRetryable).toBe(false);
    });

    test("parses_429_rate_limit_error", () => {
        const response = new Response(null, { status: 429 });
        const body = {
            error: {
                code: 429,
                message: "Rate limit exceeded",
            },
        };

        const error = parseOpenRouterError(response, body);

        expect(error.code).toBe(429);
        expect(error.userMessage).toBe(
            "Too many requests. Please wait before trying again.",
        );
        expect(error.isRetryable).toBe(true);
    });

    test("parses_moderation_error_with_metadata", () => {
        const response = new Response(null, { status: 403 });
        const body = {
            error: {
                code: 403,
                message: "Content flagged",
                metadata: {
                    reasons: ["hate", "violence"],
                    flagged_input: "Some flagged text...",
                },
            },
        };

        const error = parseOpenRouterError(response, body);

        expect(error.code).toBe(403);
        expect(error.metadata?.moderationReasons).toEqual(["hate", "violence"]);
        expect(error.metadata?.flaggedInput).toBe("Some flagged text...");
    });

    test("parses_provider_error_with_metadata", () => {
        const response = new Response(null, { status: 502 });
        const body = {
            error: {
                code: 502,
                message: "Provider error",
                metadata: {
                    provider_name: "OpenAI",
                    raw: { message: "Connection refused" },
                },
            },
        };

        const error = parseOpenRouterError(response, body);

        expect(error.code).toBe(502);
        expect(error.metadata?.providerName).toBe("OpenAI");
        expect(error.metadata?.rawError).toEqual({
            message: "Connection refused",
        });
    });

    test("handles_error_without_body", () => {
        const response = new Response(null, {
            status: 500,
            statusText: "Internal Server Error",
        });

        const error = parseOpenRouterError(response);

        expect(error.code).toBe(500);
        expect(error.message).toBe("Internal Server Error");
        expect(error.userMessage).toBe("Server error. Please try again later.");
    });

    test("handles_invalid_json_body", () => {
        const response = new Response(null, { status: 500 });
        const body = { invalid: "json" };

        const error = parseOpenRouterError(response, body);

        expect(error.code).toBe(500);
    });
});

describe("parseMidStreamError", () => {
    test("returns_error_for_finish_reason_error", () => {
        const chunk = {
            id: "test-123",
            object: "chat.completion.chunk",
            error: {
                code: 502,
                message: "Provider disconnected",
            },
            choices: [
                {
                    index: 0,
                    delta: { content: "" },
                    finish_reason: "error",
                },
            ],
        };

        const error = parseMidStreamError(chunk);

        expect(error).not.toBeNull();
        expect(error?.code).toBe(502);
        expect(error?.message).toBe("Provider disconnected");
    });

    test("returns_null_for_valid_chunk", () => {
        const chunk = {
            id: "test-123",
            object: "chat.completion.chunk",
            choices: [
                {
                    index: 0,
                    delta: { content: "Hello" },
                    finish_reason: null,
                },
            ],
        };

        const error = parseMidStreamError(chunk);

        expect(error).toBeNull();
    });

    test("returns_null_for_empty_choices", () => {
        const chunk = {
            id: "test-123",
            object: "chat.completion.chunk",
            choices: [],
        };

        const error = parseMidStreamError(chunk);

        expect(error).toBeNull();
    });

    test("handles_error_without_code", () => {
        const chunk = {
            id: "test-123",
            object: "chat.completion.chunk",
            error: {
                message: "Unknown error",
            },
            choices: [
                {
                    index: 0,
                    delta: { content: "" },
                    finish_reason: "error",
                },
            ],
        };

        const error = parseMidStreamError(chunk);

        expect(error).not.toBeNull();
        expect(error?.code).toBe(500);
    });
});

describe("createErrorFromException", () => {
    test("creates_error_from_error_instance", () => {
        const error = new Error("Network failed");

        const result = createErrorFromException(error);

        expect(result.code).toBe(0);
        expect(result.message).toBe("Network failed");
        expect(result.userMessage).toBe("An error occurred. Please try again.");
        expect(result.isRetryable).toBe(true);
    });

    test("creates_error_from_string", () => {
        const result = createErrorFromException("Something went wrong");

        expect(result.code).toBe(0);
        expect(result.message).toBe("Something went wrong");
        expect(result.isRetryable).toBe(true);
    });

    test("creates_error_from_unknown", () => {
        const result = createErrorFromException(null);

        expect(result.message).toBe("null");
        expect(result.isRetryable).toBe(true);
    });
});
