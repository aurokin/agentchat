/**
 * Convex Type Definitions
 *
 * These types define the interface for Convex operations without depending
 * on generated types. This allows the code to compile even when Convex
 * isn't initialized yet.
 */

import type { ChatSession, Message } from "@/lib/types";

/**
 * Branded type for Convex document IDs.
 * The __tableName property is never actually set at runtime,
 * it's just used for type-level discrimination.
 */
export type ConvexId<TableName extends string> = string & {
    readonly __tableName: TableName;
};

/**
 * Convex client interface for mutations and queries.
 */
export interface ConvexClientInterface {
    mutation<Args, Result>(
        fn: ConvexFunctionReference<"mutation", Args, Result>,
        args: Args,
    ): Promise<Result>;
    query<Args, Result>(
        fn: ConvexFunctionReference<"query", Args, Result>,
        args: Args,
    ): Promise<Result>;
}

/**
 * Generic function reference type.
 * This matches Convex's FunctionReference pattern without importing it.
 */
export interface ConvexFunctionReference<
    Type extends "mutation" | "query" | "action",
    _Args = unknown,
    _Result = unknown,
> {
    _type: Type;
    _args: _Args;
    _returnType: _Result;
}

export interface ConvexPaginationOpts {
    numItems: number;
    cursor: string | null;
    endCursor?: string | null;
    maximumRowsRead?: number;
    maximumBytesRead?: number;
}

export interface ConvexPaginationResult<T> {
    page: T[];
    isDone: boolean;
    continueCursor: string;
    splitCursor?: string | null;
    pageStatus?: "SplitRecommended" | "SplitRequired" | null;
}

/**
 * Convex document types (matching the schema)
 */
export interface ConvexChat {
    _id: ConvexId<"chats">;
    userId: ConvexId<"users">;
    localId: string;
    agentId: string;
    title: string;
    modelId: string;
    variantId?: string | null;
    settingsLockedAt: number | null;
    lastViewedAt?: number | null;
    createdAt: number;
    updatedAt: number;
}

export interface ConvexMessage {
    _id: ConvexId<"messages">;
    userId: ConvexId<"users">;
    chatId: ConvexId<"chats">;
    localId: string;
    role: Message["role"];
    kind?: Message["kind"];
    content: string;
    contextContent: string;
    status: NonNullable<Message["status"]>;
    runId: string | null;
    reasoning?: string;
    runMessageIndex?: number | null;
    modelId?: string;
    variantId?: string | null;
    reasoningEffort?: Message["reasoningEffort"];
    createdAt: number;
    updatedAt: number;
    completedAt: number | null;
}

/**
 * API function types - these match what the generated API will have
 */
export interface ConvexAPI {
    chats: {
        create: ConvexFunctionReference<
            "mutation",
            {
                userId: ConvexId<"users">;
                localId: string;
                agentId: string;
                title: string;
                modelId: string;
                variantId?: string | null;
                settingsLockedAt?: number | null;
                createdAt: number;
                updatedAt: number;
            },
            ConvexId<"chats">
        >;
        get: ConvexFunctionReference<
            "query",
            { id: ConvexId<"chats"> },
            ConvexChat | null
        >;
        getByLocalId: ConvexFunctionReference<
            "query",
            { userId: ConvexId<"users">; localId: string },
            ConvexChat | null
        >;
        listByUser: ConvexFunctionReference<
            "query",
            { userId: ConvexId<"users"> },
            ConvexChat[]
        >;
        listByUserPaginated: ConvexFunctionReference<
            "query",
            {
                userId: ConvexId<"users">;
                paginationOpts: ConvexPaginationOpts;
            },
            ConvexPaginationResult<ConvexChat>
        >;
        listByUserAndAgentPaginated: ConvexFunctionReference<
            "query",
            {
                userId: ConvexId<"users">;
                agentId: string;
                paginationOpts: ConvexPaginationOpts;
            },
            ConvexPaginationResult<ConvexChat>
        >;
        update: ConvexFunctionReference<
            "mutation",
            {
                id: ConvexId<"chats">;
                title: string;
                modelId: string;
                variantId?: string | null;
            },
            void
        >;
        markViewed: ConvexFunctionReference<
            "mutation",
            { id: ConvexId<"chats">; timestamp: number },
            void
        >;
        remove: ConvexFunctionReference<
            "mutation",
            { id: ConvexId<"chats"> },
            void
        >;
    };
    messages: {
        create: ConvexFunctionReference<
            "mutation",
            {
                userId: ConvexId<"users">;
                chatId: ConvexId<"chats">;
                localId: string;
                role: Message["role"];
                kind?: Message["kind"];
                content: string;
                contextContent: string;
                status?: Message["status"];
                runId?: string | null;
                reasoning?: string;
                runMessageIndex?: number | null;
                modelId?: string;
                variantId?: string | null;
                reasoningEffort?: Message["reasoningEffort"];
                createdAt: number;
                updatedAt?: number;
                completedAt?: number | null;
            },
            ConvexId<"messages">
        >;
        getByLocalId: ConvexFunctionReference<
            "query",
            { userId: ConvexId<"users">; localId: string },
            ConvexMessage | null
        >;
        listByChat: ConvexFunctionReference<
            "query",
            { chatId: ConvexId<"chats"> },
            ConvexMessage[]
        >;
        listByChatPaginated: ConvexFunctionReference<
            "query",
            { chatId: ConvexId<"chats">; paginationOpts: ConvexPaginationOpts },
            ConvexPaginationResult<ConvexMessage>
        >;
        update: ConvexFunctionReference<
            "mutation",
            {
                id: ConvexId<"messages">;
                content: string;
                contextContent: string;
                reasoning?: string;
                runMessageIndex?: number | null;
                variantId?: string | null;
            },
            void
        >;
        remove: ConvexFunctionReference<
            "mutation",
            { id: ConvexId<"messages"> },
            void
        >;
        deleteByChat: ConvexFunctionReference<
            "mutation",
            { chatId: ConvexId<"chats"> },
            void
        >;
    };
}
