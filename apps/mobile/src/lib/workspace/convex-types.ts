import type { ChatSession, Message } from "@shared/core/types";

export type ConvexId<TableName extends string> = string & {
    readonly __tableName: TableName;
};

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

export interface ConvexChat {
    _id: ConvexId<"chats">;
    userId: ConvexId<"users">;
    localId: string;
    agentId: string;
    title: string;
    modelId: string;
    variantId?: string | null;
    settingsLockedAt?: number | null;
    createdAt: number;
    updatedAt: number;
}

export interface ConvexMessage {
    _id: ConvexId<"messages">;
    userId: ConvexId<"users">;
    chatId: ConvexId<"chats">;
    localId: string;
    role: Message["role"];
    content: string;
    contextContent: string;
    status?: Message["status"];
    runId?: Message["runId"];
    thinking?: string;
    modelId?: string;
    variantId?: string | null;
    thinkingLevel?: Message["thinkingLevel"];
    createdAt: number;
    updatedAt?: number | null;
    completedAt?: number | null;
}

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
                content: string;
                contextContent: string;
                thinking?: string;
                modelId?: string;
                variantId?: string | null;
                thinkingLevel?: Message["thinkingLevel"];
                createdAt: number;
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
                thinking?: string;
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
