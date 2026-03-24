import { describe, expect, test } from "bun:test";
import {
    consumePendingSharePayload,
    setPendingSharePayload,
} from "@/lib/share-intent/pending-share";

describe("pending share payload", () => {
    test("stores and consumes shared text once per chat", () => {
        setPendingSharePayload("chat-1", "agent-1", {
            text: "hello from share",
        });

        expect(consumePendingSharePayload("chat-1", "agent-1")).toEqual({
            text: "hello from share",
        });
        expect(consumePendingSharePayload("chat-1", "agent-1")).toBeNull();
    });

    test("keeps payloads isolated by chat and agent id", () => {
        setPendingSharePayload("chat-a", "agent-a", { text: "alpha" });
        setPendingSharePayload("chat-a", "agent-b", { text: "beta" });

        expect(consumePendingSharePayload("chat-a", "agent-a")).toEqual({
            text: "alpha",
        });
        expect(consumePendingSharePayload("chat-a", "agent-b")).toEqual({
            text: "beta",
        });
    });
});
