"use node";

import { action } from "./_generated/server";
import { api } from "./_generated/api";
import { createBackendSessionToken } from "../../shared/src/core/backend-token";
import {
    getDisabledUserProfile,
    isAgentchatAuthDisabled,
} from "./lib/auth_mode";

const BACKEND_TOKEN_TTL_SECONDS = 60 * 5;

export const issue = action({
    args: {},
    handler: async (ctx) => {
        const secret = process.env.BACKEND_TOKEN_SECRET?.trim();
        if (!secret) {
            throw new Error(
                "BACKEND_TOKEN_SECRET is not configured for this instance.",
            );
        }

        let subject: string;
        let userId: string;
        let email: string;

        if (isAgentchatAuthDisabled()) {
            const profile = getDisabledUserProfile();
            subject = profile.subject;
            email = profile.email;
            userId = await ctx.runMutation(api.users.ensureAccessUser, {});
        } else {
            const identity = await ctx.auth.getUserIdentity();
            if (!identity) {
                throw new Error("Not authenticated");
            }

            const resolvedUserId: string | null = await ctx.runQuery(
                api.users.getCurrentUserId,
                {},
            );
            if (!resolvedUserId) {
                throw new Error(
                    "Authenticated user is missing a Convex user id.",
                );
            }

            const user = await ctx.runQuery(api.users.get, {
                id: resolvedUserId as any,
            });
            const resolvedEmail =
                identity.email?.trim() || user?.email?.trim() || "";
            if (!resolvedEmail) {
                throw new Error(
                    "Authenticated user is missing an email address.",
                );
            }

            subject = identity.subject;
            userId = resolvedUserId;
            email = resolvedEmail;
        }

        const iat = Math.floor(Date.now() / 1000);
        const exp = iat + BACKEND_TOKEN_TTL_SECONDS;
        const token = await createBackendSessionToken({
            claims: {
                sub: subject,
                userId,
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
