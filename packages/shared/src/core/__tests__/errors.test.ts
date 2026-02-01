import { describe, expect, it } from "bun:test";
import {
    createErrorFromException,
    getUserMessage,
    isRetryableError,
    parseMidStreamError,
    parseOpenRouterError,
} from "../errors";

describe("errors", () => {
    it("returns moderated message when reasons exist", () => {
        expect(getUserMessage(403, { reasons: ["hate"] })).toBe(
            "Your message was flagged by moderation.",
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
});
