import { describe, expect, test } from "bun:test";

import { buildRuntimeIngressErrorResponse } from "../http";

describe("runtime ingress http", () => {
    test("maps unauthorized ingress errors to 401", async () => {
        const response = buildRuntimeIngressErrorResponse(
            new Error("Unauthorized runtime ingress request"),
        );

        expect(response.status).toBe(401);
        await expect(response.json()).resolves.toEqual({
            error: "Unauthorized runtime ingress request",
        });
    });

    test("maps invalid json payloads to 400", async () => {
        const response = buildRuntimeIngressErrorResponse(
            new SyntaxError("Unexpected end of JSON input"),
        );

        expect(response.status).toBe(400);
        await expect(response.json()).resolves.toEqual({
            error: "Unexpected end of JSON input",
        });
    });

    test("maps Convex argument validation errors to 400", async () => {
        const error = new Error(
            "ArgumentValidationError: Object is missing required field `agentId`.",
        );
        error.name = "ArgumentValidationError";

        const response = buildRuntimeIngressErrorResponse(error);

        expect(response.status).toBe(400);
        await expect(response.json()).resolves.toEqual({
            error:
                "ArgumentValidationError: Object is missing required field `agentId`.",
        });
    });

    test("maps message-only Convex argument validation failures to 400", async () => {
        const response = buildRuntimeIngressErrorResponse(
            new Error(
                "ArgumentValidationError: Object is missing required field `agentId`.",
            ),
        );

        expect(response.status).toBe(400);
        await expect(response.json()).resolves.toEqual({
            error:
                "ArgumentValidationError: Object is missing required field `agentId`.",
        });
    });

    test("maps unexpected ingress failures to 500", async () => {
        const response = buildRuntimeIngressErrorResponse(new Error("boom"));

        expect(response.status).toBe(500);
        await expect(response.json()).resolves.toEqual({
            error: "boom",
        });
    });
});
