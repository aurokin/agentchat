export async function drainBatches<T>(
    fetchBatch: () => Promise<T[]>,
    handle: (item: T) => Promise<void>,
    options?: {
        maxIterations?: number;
    },
): Promise<number> {
    const maxIterations = options?.maxIterations ?? 10_000;
    let total = 0;

    for (let i = 0; i < maxIterations; i++) {
        const batch = await fetchBatch();
        if (batch.length === 0) {
            return total;
        }

        for (const item of batch) {
            await handle(item);
            total++;
        }
    }

    throw new Error("Exceeded maximum batch iterations");
}

export async function safeStorageDelete(
    ctx: { storage: { delete: (storageId: any) => Promise<void> } },
    storageId: unknown,
): Promise<void> {
    try {
        await ctx.storage.delete(storageId as any);
    } catch (error) {
        // Avoid turning cleanup into a hard failure. If something is already
        // deleted (or the storage backend is flaky), we still want DB cleanup to
        // continue to completion.
        console.error("Failed to delete storage object:", storageId, error);
    }
}
