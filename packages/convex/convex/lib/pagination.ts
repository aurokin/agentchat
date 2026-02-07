import type { PaginationOptions } from "convex/server";

/**
 * Convert validated pagination options (which may include `id` from
 * `paginationOptsValidator`) into the server-side `PaginationOptions` type.
 */
export function clampPaginationOpts(
    paginationOpts: {
        numItems: number;
        cursor: string | null;
        // allow extra properties like `id` without impacting type-checking.
        // Note: Convex also supports some internal pagination knobs (e.g.
        // `endCursor`, `maximumRowsRead`, `maximumBytesRead`), but they are
        // intentionally not part of the public `PaginationOptions` type.
        [key: string]: unknown;
    },
    maxNumItems: number,
): PaginationOptions {
    const numItems = Math.max(
        0,
        Math.min(paginationOpts.numItems, maxNumItems),
    );

    return {
        numItems,
        cursor: paginationOpts.cursor,
    };
}
