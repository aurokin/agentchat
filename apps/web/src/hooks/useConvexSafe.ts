"use client";

import { useQuery, useMutation, useAction } from "convex/react";
import { useCallback, useMemo } from "react";
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
export function getEffectiveQueryArgs<Query extends FunctionReference<"query">>(
    isAvailable: boolean,
    args: FunctionArgs<Query> | "skip",
): FunctionArgs<Query> | "skip" {
    return (isAvailable && args !== "skip" ? args : "skip") as
        | FunctionArgs<Query>
        | "skip";
}

export function selectSafeCallback<Args extends unknown[], Return>(
    isAvailable: boolean,
    realFn: (...args: Args) => Return,
    noopFn: (...args: Args) => Return,
): (...args: Args) => Return {
    return isAvailable ? realFn : noopFn;
}

export function useQuerySafe<Query extends FunctionReference<"query">>(
    query: Query,
    args: FunctionArgs<Query> | "skip",
): FunctionReturnType<Query> | undefined {
    const isAvailable = useIsConvexAvailable();

    // When not available, use "skip" to prevent the query from running
    // The type assertion is needed because TypeScript can't infer that
    // "skip" is a valid value for the args parameter in all cases
    const effectiveArgs = getEffectiveQueryArgs(isAvailable, args);

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
    const mutate = useMutation(mutation);
    const noop = useCallback(async () => null, []);

    return useMemo(
        () => selectSafeCallback(isAvailable, mutate, noop),
        [isAvailable, mutate, noop],
    );
}

/**
 * Safe version of useAction that returns a no-op when Convex is not available
 */
export function useActionSafe<Action extends FunctionReference<"action">>(
    action: Action,
): (args: FunctionArgs<Action>) => Promise<FunctionReturnType<Action> | null> {
    const isAvailable = useIsConvexAvailable();
    const act = useAction(action);
    const noop = useCallback(async () => null, []);

    return useMemo(
        () => selectSafeCallback(isAvailable, act, noop),
        [isAvailable, act, noop],
    );
}
