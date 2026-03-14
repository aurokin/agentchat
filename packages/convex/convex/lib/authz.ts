import { getAuthUserId } from "@convex-dev/auth/server";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { isAgentchatAuthDisabled, getDisabledUserProfile } from "./auth_mode";

export type AuthCtx = QueryCtx | MutationCtx;

export async function getAccessUserId(
    ctx: AuthCtx,
): Promise<Id<"users"> | null> {
    if (isAgentchatAuthDisabled()) {
        const { email } = getDisabledUserProfile();
        const defaultUser = await ctx.db
            .query("users")
            .withIndex("email", (q) => q.eq("email", email))
            .unique();
        return (defaultUser?._id as Id<"users"> | undefined) ?? null;
    }

    const userId = await getAuthUserId(ctx);
    return (userId as Id<"users"> | null) ?? null;
}

export async function requireAuthUserId(ctx: AuthCtx): Promise<Id<"users">> {
    const accessUserId = await getAccessUserId(ctx);
    if (accessUserId) {
        return accessUserId;
    }

    if (isAgentchatAuthDisabled()) {
        throw new Error(
            "Default user is not initialized. Call users.ensureAccessUser first.",
        );
    }

    const userId = await getAuthUserId(ctx);
    if (!userId) {
        throw new Error("Not authenticated");
    }
    return userId as Id<"users">;
}

export function requireUserMatches(
    authenticatedUserId: string,
    expectedUserId: string,
): void {
    if (authenticatedUserId !== expectedUserId) {
        throw new Error("Unauthorized");
    }
}

export function isOwner(
    doc: { userId: string } | null,
    authenticatedUserId: string,
): boolean {
    return !!doc && doc.userId === authenticatedUserId;
}
