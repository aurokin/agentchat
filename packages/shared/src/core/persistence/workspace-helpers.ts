import type { ChatSession, Message, ReasoningEffort } from "../types";

const REASONING_EFFORTS = new Set<string>([
    "xhigh",
    "high",
    "medium",
    "low",
    "minimal",
    "none",
]);

export function isReasoningEffort(
    value: string | null | undefined,
): value is ReasoningEffort {
    return typeof value === "string" && REASONING_EFFORTS.has(value);
}

export function toReasoningEffort(
    value: string | null | undefined,
): ReasoningEffort {
    return isReasoningEffort(value) ? value : "none";
}

export function mergeByIdWithPending<T extends { id: string }>(
    workspaceItems: T[],
    prev: T[],
    pending: Set<string>,
    sort?: (a: T, b: T) => number,
): T[] {
    const byId = new Map<string, T>();

    for (const item of workspaceItems) {
        byId.set(item.id, item);
    }

    for (const item of prev) {
        if (pending.has(item.id) && !byId.has(item.id)) {
            byId.set(item.id, item);
        }
    }

    const merged = Array.from(byId.values());
    return sort ? merged.sort(sort) : merged;
}

export interface ConvexChatLike {
    _id: string;
    localId?: string | null;
    agentId?: string | null;
    title: string;
    modelId: string;
    variantId?: string | null;
    settingsLockedAt?: number | null;
    createdAt: number;
    updatedAt: number;
}

export interface ConvexMessageLike {
    _id: string;
    localId?: string | null;
    role: Message["role"];
    kind?: Message["kind"] | null;
    content: string;
    contextContent: string;
    reasoning?: string | null;
    status?: Message["status"] | null;
    runId?: string | null;
    runMessageIndex?: number | null;
    modelId?: string | null;
    variantId?: string | null;
    reasoningEffort?: string | null;
    createdAt: number;
    updatedAt?: number | null;
    completedAt?: number | null;
}

export function mapConvexChatToSession(chat: ConvexChatLike): ChatSession {
    return {
        id: chat.localId ?? chat._id,
        agentId: chat.agentId ?? "",
        title: chat.title,
        modelId: chat.modelId,
        variantId: chat.variantId ?? null,
        settingsLockedAt: chat.settingsLockedAt ?? null,
        createdAt: chat.createdAt,
        updatedAt: chat.updatedAt,
    };
}

export function mapConvexMessageToMessage(
    msg: ConvexMessageLike,
    chatLocalId: string,
): Message {
    return {
        id: msg.localId ?? msg._id,
        sessionId: chatLocalId,
        role: msg.role,
        kind: msg.kind ?? undefined,
        content: msg.content,
        contextContent: msg.contextContent,
        status: msg.status ?? undefined,
        reasoning: msg.reasoning ?? undefined,
        runId: msg.runId ?? null,
        runMessageIndex: msg.runMessageIndex ?? null,
        modelId: msg.modelId ?? undefined,
        variantId: msg.variantId ?? null,
        reasoningEffort: toReasoningEffort(msg.reasoningEffort),
        createdAt: msg.createdAt,
        updatedAt: msg.updatedAt ?? undefined,
        completedAt: msg.completedAt ?? null,
    };
}
