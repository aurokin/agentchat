import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export type WorkspaceUsageCounters = {
    chatCount: number;
    messageCount: number;
};

const DEFAULT_COUNTERS: WorkspaceUsageCounters = {
    chatCount: 0,
    messageCount: 0,
};

const USER_COUNTER_FIELDS = {
    chatCount: "workspaceChatCount",
    messageCount: "workspaceMessageCount",
} as const;

function isNonNegativeFiniteNumber(value: unknown): value is number {
    return (
        typeof value === "number" &&
        Number.isFinite(value) &&
        value >= 0 &&
        !Number.isNaN(value)
    );
}

function readNumber(value: unknown): number | null {
    return isNonNegativeFiniteNumber(value) ? value : null;
}

export function readWorkspaceUsageCountersFromUser(
    user: unknown,
): WorkspaceUsageCounters | null {
    if (!user || typeof user !== "object") return null;

    const chatCount = readNumber((user as any)[USER_COUNTER_FIELDS.chatCount]);
    const messageCount = readNumber(
        (user as any)[USER_COUNTER_FIELDS.messageCount],
    );

    if (chatCount === null || messageCount === null) {
        return null;
    }

    return {
        chatCount,
        messageCount,
    };
}

export function workspaceUsageCountersToPatch(
    counters: WorkspaceUsageCounters,
): Record<string, number> {
    return {
        [USER_COUNTER_FIELDS.chatCount]: counters.chatCount,
        [USER_COUNTER_FIELDS.messageCount]: counters.messageCount,
    };
}

type PageResult<T> = {
    page: T[];
    isDone: boolean;
    continueCursor: string;
};

async function countPaginated<T>(
    fetchPage: (cursor: string | null) => Promise<PageResult<T>>,
): Promise<number> {
    let cursor: string | null = null;
    let count = 0;

    for (let i = 0; i < 100_000; i++) {
        const result = await fetchPage(cursor);
        count += result.page?.length ?? 0;

        if (result.isDone) {
            return count;
        }

        if (result.continueCursor === cursor) {
            throw new Error("Pagination cursor did not advance");
        }

        cursor = result.continueCursor;
    }

    throw new Error("Pagination exceeded maximum number of pages");
}

export async function computeWorkspaceChatCount(
    ctx: Pick<QueryCtx, "db">,
    userId: Id<"users">,
): Promise<number> {
    return await countPaginated((cursor) =>
        ctx.db
            .query("chats")
            .withIndex("by_user", (q) => q.eq("userId", userId))
            .paginate({ numItems: 1_000, cursor }),
    );
}

export async function computeWorkspaceMessageCount(
    ctx: Pick<QueryCtx, "db">,
    userId: Id<"users">,
) {
    return await countPaginated((cursor) =>
        ctx.db
            .query("messages")
            .withIndex("by_user", (q) => q.eq("userId", userId))
            .paginate({ numItems: 1_000, cursor }),
    );
}

export async function computeWorkspaceUsageCounters(
    ctx: Pick<QueryCtx, "db">,
    userId: Id<"users">,
): Promise<WorkspaceUsageCounters> {
    const [chatCount, messageCount] = await Promise.all([
        computeWorkspaceChatCount(ctx, userId),
        computeWorkspaceMessageCount(ctx, userId),
    ]);

    return {
        chatCount,
        messageCount,
    };
}

export async function ensureWorkspaceUsageCounters(
    ctx: Pick<MutationCtx, "db">,
    userId: Id<"users">,
): Promise<WorkspaceUsageCounters> {
    const user = await ctx.db.get(userId);
    if (!user) {
        throw new Error("User not found");
    }

    const existing = readWorkspaceUsageCountersFromUser(user);
    if (existing) {
        return existing;
    }

    const computed = await computeWorkspaceUsageCounters(ctx as any, userId);
    await ctx.db.patch(userId, workspaceUsageCountersToPatch(computed) as any);
    return computed;
}

export async function applyWorkspaceUsageDelta(
    ctx: Pick<MutationCtx, "db">,
    userId: Id<"users">,
    delta: Partial<WorkspaceUsageCounters>,
): Promise<WorkspaceUsageCounters> {
    const current = await ensureWorkspaceUsageCounters(ctx as any, userId);

    const next: WorkspaceUsageCounters = {
        chatCount: Math.max(0, current.chatCount + (delta.chatCount ?? 0)),
        messageCount: Math.max(
            0,
            current.messageCount + (delta.messageCount ?? 0),
        ),
    };

    await ctx.db.patch(userId, workspaceUsageCountersToPatch(next) as any);
    return next;
}

export function zeroWorkspaceUsageCounters(): WorkspaceUsageCounters {
    return { ...DEFAULT_COUNTERS };
}
