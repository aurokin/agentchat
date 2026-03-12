"use node";

import { action } from "./_generated/server";
import { createBackendSessionToken } from "../../shared/src/core/backend-token";

const BACKEND_TOKEN_TTL_SECONDS = 60 * 5;

export const issue = action({
    args: {},
    handler: async (ctx) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) {
            throw new Error("Not authenticated");
        }

        const email = identity.email?.trim();
        if (!email) {
            throw new Error("Authenticated user is missing an email address.");
        }

        const secret = process.env.BACKEND_TOKEN_SECRET?.trim();
        if (!secret) {
            throw new Error(
                "BACKEND_TOKEN_SECRET is not configured for this deployment.",
            );
        }

        const iat = Math.floor(Date.now() / 1000);
        const exp = iat + BACKEND_TOKEN_TTL_SECONDS;
        const token = await createBackendSessionToken({
            claims: {
                sub: identity.subject,
                email,
                iat,
                exp,
            },
            secret,
        });

        return {
            token,
            expiresAt: exp,
        };
    },
});
