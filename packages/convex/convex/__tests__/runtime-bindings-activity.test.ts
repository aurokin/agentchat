import { describe, expect, mock, test } from "bun:test";

import {
    listAgentActivityCounts,
    resolvePersistedConversationActivity,
} from "../runtimeBindings";

describe("runtime binding activity", () => {
    test("marks active bindings as working", () => {
        expect(
            resolvePersistedConversationActivity({
                status: "active",
                lastEventAt: 20,
                lastViewedAt: 10,
            }),
        ).toEqual({
            label: "Working",
            tone: "working",
        });
    });

    test("marks errored bindings as needing attention", () => {
        expect(
            resolvePersistedConversationActivity({
                status: "errored",
                lastEventAt: 20,
                lastViewedAt: 10,
            }),
        ).toEqual({
            label: "Needs attention",
            tone: "errored",
        });
    });

    test("marks unseen completed activity as a new reply", () => {
        expect(
            resolvePersistedConversationActivity({
                status: "idle",
                lastEventAt: 20,
                lastViewedAt: 10,
            }),
        ).toEqual({
            label: "New reply",
            tone: "completed",
        });
    });

    test("does not mark viewed idle activity", () => {
        expect(
            resolvePersistedConversationActivity({
                status: "idle",
                lastEventAt: 20,
                lastViewedAt: 20,
            }),
        ).toBeNull();
    });

    test("aggregates agent activity counts from persisted activity state", async () => {
        const authUserId = "users:auth";
        const runtimeBindings = [
            {
                chatId: "chats:1",
                userId: authUserId,
                status: "active",
                activeRunId: "run-1",
                lastEventAt: 30,
                updatedAt: 30,
            },
            {
                chatId: "chats:2",
                userId: authUserId,
                status: "idle",
                activeRunId: null,
                lastEventAt: 40,
                updatedAt: 40,
            },
            {
                chatId: "chats:3",
                userId: authUserId,
                status: "errored",
                activeRunId: null,
                lastEventAt: 50,
                updatedAt: 50,
            },
        ];
        const chatsById = {
            "chats:1": {
                _id: "chats:1",
                agentId: "agent-1",
                lastViewedAt: 10,
            },
            "chats:2": {
                _id: "chats:2",
                agentId: "agent-1",
                lastViewedAt: 20,
            },
            "chats:3": {
                _id: "chats:3",
                agentId: "agent-2",
                lastViewedAt: 10,
            },
        } as const;
        const ctx = {
            auth: {
                getUserIdentity: async () => ({
                    subject: `${authUserId}|session:auth`,
                }),
            },
            db: {
                query: () => ({
                    withIndex: () => ({
                        collect: async () => runtimeBindings,
                    }),
                }),
                get: mock(async (id: string) => chatsById[id as keyof typeof chatsById] ?? null),
            },
        };

        const result = await (
            listAgentActivityCounts as unknown as {
                _handler: (ctx: unknown, args: Record<string, never>) => Promise<
                    Array<{
                        agentId: string;
                        activeCount: number;
                        newReplyCount: number;
                        needsAttentionCount: number;
                    }>
                >;
            }
        )._handler(ctx, {});

        expect(result).toEqual([
            {
                agentId: "agent-1",
                activeCount: 1,
                newReplyCount: 1,
                needsAttentionCount: 0,
            },
            {
                agentId: "agent-2",
                activeCount: 0,
                newReplyCount: 0,
                needsAttentionCount: 1,
            },
        ]);
    });
});
