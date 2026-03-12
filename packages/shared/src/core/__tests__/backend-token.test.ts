import { describe, expect, test } from "bun:test";

import {
    createBackendSessionToken,
    verifyBackendSessionToken,
} from "../backend-token";

const claims = {
    sub: "user-123",
    email: "user@example.com",
    iat: 1_700_000_000,
    exp: 1_700_000_300,
};

describe("backend token helpers", () => {
    test("creates and verifies a backend session token", async () => {
        const token = await createBackendSessionToken({
            claims,
            secret: "test-secret",
        });

        await expect(
            verifyBackendSessionToken({
                token,
                secret: "test-secret",
                nowSeconds: claims.iat,
            }),
        ).resolves.toEqual(claims);
    });

    test("rejects a token with a modified signature", async () => {
        const token = await createBackendSessionToken({
            claims,
            secret: "test-secret",
        });
        const tampered = `${token.slice(0, -1)}x`;

        await expect(
            verifyBackendSessionToken({
                token: tampered,
                secret: "test-secret",
                nowSeconds: claims.iat,
            }),
        ).rejects.toThrow("Invalid backend token signature");
    });

    test("rejects an expired token", async () => {
        const token = await createBackendSessionToken({
            claims,
            secret: "test-secret",
        });

        await expect(
            verifyBackendSessionToken({
                token,
                secret: "test-secret",
                nowSeconds: claims.exp,
            }),
        ).rejects.toThrow("Backend token expired");
    });
});
