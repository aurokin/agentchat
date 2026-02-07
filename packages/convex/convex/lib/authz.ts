import { getAuthUserId } from "@convex-dev/auth/server";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export type AuthCtx = QueryCtx | MutationCtx;

export async function requireAuthUserId(ctx: AuthCtx): Promise<Id<"users">> {
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
