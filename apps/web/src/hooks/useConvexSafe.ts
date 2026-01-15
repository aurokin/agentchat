"use client";

import { useQuery, useMutation, useAction } from "convex/react";
import { useIsConvexAvailable } from "@/contexts/ConvexProvider";
import type {
    FunctionReference,
    FunctionArgs,
    FunctionReturnType,
} from "convex/server";

/**
 * Safe Convex Hooks
 *
 * These hooks wrap Convex's hooks to safely handle the case when
 * Convex is not configured. They return null/undefined gracefully
 * instead of throwing errors.
 *
 * Note: There is no useConvexSafe hook because useConvex() throws when
 * called outside a ConvexProvider, making it impossible to safely wrap
 * without violating React's rules of hooks. Use useQuerySafe, useMutationSafe,
 * or useActionSafe instead, which use Convex's built-in "skip" pattern.
 */

/**
 * Safe version of useQuery that returns undefined when Convex is not available.
 *
 * Uses Convex's built-in "skip" functionality to handle unavailability.
 */
export function useQuerySafe<Query extends FunctionReference<"query">>(
    query: Query,
    args: FunctionArgs<Query> | "skip",
): FunctionReturnType<Query> | undefined {
    const isAvailable = useIsConvexAvailable();

    // When not available, use "skip" to prevent the query from running
    // The type assertion is needed because TypeScript can't infer that
    // "skip" is a valid value for the args parameter in all cases
    const effectiveArgs = (isAvailable && args !== "skip" ? args : "skip") as
        | FunctionArgs<Query>
        | "skip";

    // Always call useQuery to satisfy React's rules of hooks
    const result = useQuery(query, effectiveArgs);

    if (!isAvailable) {
        return undefined;
    }

    return result;
}

/**
 * Safe version of useMutation that returns a no-op when Convex is not available
 */
export function useMutationSafe<Mutation extends FunctionReference<"mutation">>(
    mutation: Mutation,
): (
    args: FunctionArgs<Mutation>,
) => Promise<FunctionReturnType<Mutation> | null> {
    const isAvailable = useIsConvexAvailable();

    let mutate: ReturnType<typeof useMutation<Mutation>> | null = null;

    try {
        mutate = useMutation(mutation);
    } catch {
        mutate = null;
    }

    if (!isAvailable || !mutate) {
        return async () => null;
    }

    return mutate;
}

/**
 * Safe version of useAction that returns a no-op when Convex is not available
 */
export function useActionSafe<Action extends FunctionReference<"action">>(
    action: Action,
): (args: FunctionArgs<Action>) => Promise<FunctionReturnType<Action> | null> {
    const isAvailable = useIsConvexAvailable();

    let act: ReturnType<typeof useAction<Action>> | null = null;

    try {
        act = useAction(action);
    } catch {
        act = null;
    }

    if (!isAvailable || !act) {
        return async () => null;
    }

    return act;
}
