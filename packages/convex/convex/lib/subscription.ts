import type { Id } from "../_generated/dataModel";
import type { AuthCtx } from "./authz";
import { requireAuthUserId } from "./authz";

export function hasCloudSync(user: unknown): boolean {
    return Boolean(user);
}

export async function requireCloudSync(ctx: AuthCtx): Promise<Id<"users">> {
    return await requireAuthUserId(ctx);
}
