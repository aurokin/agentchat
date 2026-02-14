import { describe, expect, it } from "bun:test";
import {
    createErrorFromException,
    getUserMessage,
    isRetryableError,
    parseMidStreamError,
    parseOpenRouterError,
} from "../errors";

describe("errors", () => {
    it("maps common status codes to stable user messages", () => {
        expect(getUserMessage(400)).toBe(
            "Invalid request. Please check your input.",
        );
        expect(getUserMessage(401)).toBe(
            "Invalid API key. Please check your settings.",
        );
        expect(getUserMessage(429)).toBe(
            "Too many requests. Please wait before trying again.",
        );
        expect(getUserMessage(503)).toBe(
            "No providers available. Try again later.",
        );
    });

    it("returns moderated message when reasons exist", () => {
        expect(getUserMessage(403, { reasons: ["hate"] })).toBe(
            "Your message was flagged by moderation.",
        );
    });

    it("uses default 403 message without moderation reasons", () => {
        expect(getUserMessage(403, {})).toBe(
            "Access denied. You may not have permission to use this model.",
        );
    });

    it("maps retryable error codes", () => {
        expect(isRetryableError(408)).toBe(true);
        expect(isRetryableError(401)).toBe(false);
    });

    it("parses provider metadata", () => {
        const response = new Response(null, { status: 502 });
        const body = {
            error: {
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

    it("parses moderation metadata", () => {
        const response = new Response(null, { status: 403 });
        const body = {
            error: {
                message: "Moderation blocked",
                metadata: {
                    reasons: ["violence"],
                    flagged_input: "bad prompt",
                },
            },
        };

        const error = parseOpenRouterError(response, body);
        expect(error.metadata?.moderationReasons).toEqual(["violence"]);
        expect(error.metadata?.flaggedInput).toBe("bad prompt");
    });

    it("parses mid-stream errors", () => {
        const chunk = {
            error: { code: 502, message: "Provider disconnected" },
            choices: [{ finish_reason: "error" }],
        };

        const error = parseMidStreamError(chunk);
        expect(error?.code).toBe(502);
        expect(error?.message).toBe("Provider disconnected");
    });

    it("creates error from exception", () => {
        const result = createErrorFromException(new Error("Network failed"));
        expect(result.message).toBe("Network failed");
        expect(result.isRetryable).toBe(true);
    });

    it("creates error from non-Error exception", () => {
        const result = createErrorFromException(404);
        expect(result.code).toBe(0);
        expect(result.message).toBe("404");
        expect(result.userMessage).toBe(
            "An unexpected error occurred. Please try again.",
        );
    });
});
