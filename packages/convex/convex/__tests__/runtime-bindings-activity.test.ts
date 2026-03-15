import { describe, expect, test } from "bun:test";

import { resolvePersistedConversationActivity } from "../runtimeBindings";

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
});
