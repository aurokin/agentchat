import { beforeEach, describe, expect, test } from "bun:test";

import { createBackendSessionToken } from "../../../../packages/shared/src/core/backend-token";
import {
    authenticateBackendRequest,
    getBackendTokenFromRequest,
    toConnectionReadyEvent,
} from "../backendAuth";

describe("backend auth helpers", () => {
    beforeEach(() => {
        process.env.BACKEND_TOKEN_SECRET = "test-secret";
    });

    test("reads bearer tokens from the authorization header", () => {
        const request = new Request("http://localhost/ws", {
            headers: {
                Authorization: "Bearer test-token",
            },
        });

        expect(getBackendTokenFromRequest(request)).toBe("test-token");
    });

    test("falls back to the token query parameter", () => {
        const request = new Request("http://localhost/ws?token=test-token");
        expect(getBackendTokenFromRequest(request)).toBe("test-token");
    });

    test("verifies a signed backend token", async () => {
        const token = await createBackendSessionToken({
            claims: {
                sub: "user-123",
                userId: "users:123",
                email: "user@example.com",
                iat: Math.floor(Date.now() / 1000),
                exp: Math.floor(Date.now() / 1000) + 60,
            },
            secret: "test-secret",
        });
        const request = new Request("http://localhost/ws", {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });

        await expect(
            authenticateBackendRequest(request),
        ).resolves.toMatchObject({
            sub: "user-123",
            userId: "users:123",
            email: "user@example.com",
        });
    });

    test("serializes the connection ready payload", () => {
        expect(
            JSON.parse(
                toConnectionReadyEvent({
                    sub: "user-123",
                    userId: "users:123",
                    email: "user@example.com",
                    iat: 1,
                    exp: 2,
                }),
            ),
        ).toEqual({
            type: "connection.ready",
            payload: {
                user: {
                    sub: "user-123",
                    userId: "users:123",
                    email: "user@example.com",
                },
                transport: "websocket",
            },
        });
    });
});
