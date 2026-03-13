import type { Id } from "../_generated/dataModel";
import type { AuthCtx } from "./authz";
import { requireAuthUserId } from "./authz";

export async function requireWorkspaceUser(ctx: AuthCtx): Promise<Id<"users">> {
    return await requireAuthUserId(ctx);
}
