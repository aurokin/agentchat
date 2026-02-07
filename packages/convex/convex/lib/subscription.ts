import type { Id } from "../_generated/dataModel";
import type { AuthCtx } from "./authz";
import { requireAuthUserId } from "./authz";

export function hasCloudSync(user: unknown): boolean {
    if (!user || typeof user !== "object") return false;

    const subscriptionOverridePro = (user as any).subscriptionOverridePro;
    if (subscriptionOverridePro === true) return true;

    const entitlementActive = (user as any).entitlementActive;
    return entitlementActive === true;
}

export async function requireCloudSync(ctx: AuthCtx): Promise<Id<"users">> {
    const userId = await requireAuthUserId(ctx);
    const user = await ctx.db.get(userId);

    if (!hasCloudSync(user)) {
        throw new Error("Active subscription required for cloud sync");
    }

    return userId;
}
